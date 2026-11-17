import { describe, it, expect } from "vitest";
import type { Element } from "../../types";
import type { Pt } from "../../geo/plan";
import {
  quantitesMateriaux, quantiteElement, contoursMasqueMateriaux,
  materiauCompatible, positionRelative, decrireMateriaux, coteProche, cotesApresSuppressionSommet, massifsSansSol,
  type Materiau, type ProjeterVue,
} from "../materiaux";
import { pointDansPolygone } from "../../geo/plan";

const mat = (id: string, o: Partial<Materiau>): Materiau => ({
  id, nom: id, type: "surface", description_ia: `desc ${id}`, couleur: "#888888", hachure: "aucune",
  unite: "m2", prix_unitaire: null, largeur_m: null, ordre: 0, ...o,
});
const VOLIGE = mat("volige", { nom: "Volige acier", type: "lineaire", unite: "ml", largeur_m: 0.02, prix_unitaire: 18, ordre: 1 });
const GAZON = mat("gazon", { nom: "Gazon (rénovation)", ordre: 5, prix_unitaire: 12.5 });
const ECORCE = mat("ecorce", { nom: "Paillage écorce de pin", ordre: 3 });
const MATERIAUX = [VOLIGE, GAZON, ECORCE];

let n = 0;
const el = (geometrie: Element["geometrie"], proprietes: Record<string, unknown> = {}, type: Element["type"] = "sol"): Element => ({
  id: `e${n++}`, type, geometrie, calque: "sols", statut: "nouveau", hauteur: null, proprietes, ordre: 0,
});
const rect = (x0: number, y0: number, l: number, h: number): Pt[] => [[x0, y0], [x0 + l, y0], [x0 + l, y0 + h], [x0, y0 + h]];

describe("quantités des matériaux", () => {
  it("une volige de 12,5 m donne 12,5 ml", () => {
    const volige = el({ type: "polyligne", points: [[0, 0], [7.5, 0], [7.5, 5]] }, { materiau_id: "volige" }, "limite");
    expect(quantiteElement(volige, VOLIGE)).toBeCloseTo(12.5, 6);
    expect(quantitesMateriaux([volige], MATERIAUX)).toEqual([{ materiau: VOLIGE, quantite: 12.5, montant: 225, elements: 1 }]);
  });

  it("une surface de 20 m² donne 20 m²", () => {
    const gazon = el({ type: "polygone", points: rect(0, 0, 5, 4) }, { materiau_id: "gazon" });
    expect(quantitesMateriaux([gazon], MATERIAUX)).toEqual([{ materiau: GAZON, quantite: 20, montant: 250, elements: 1 }]);
  });

  it("clic près d'un côté : son indice ; loin, ou au-delà des extrémités : rien", () => {
    const r = el({ type: "rectangle", points: rect(0, 0, 10, 4) });
    expect(coteProche(r, [5, 0.1], 0.3)).toBe(0);
    expect(coteProche(r, [10.2, 2], 0.3)).toBe(1);
    expect(coteProche(r, [5, 4], 0.3)).toBe(2);
    expect(coteProche(r, [-0.2, -0.2], 0.3)).toBeNull(); // au-delà du sommet
    expect(coteProche(r, [5, 2], 0.3)).toBeNull();
  });

  it("suppression d'un sommet : côtés fusionnés gardés seulement si les deux l'étaient, renumérotation", () => {
    // Rectangle 4 sommets, côtés 0..3
    expect(cotesApresSuppressionSommet([0, 1], 1, 4)).toEqual([0]); // côtés 0 et 1 fusionnés, tous deux exclus
    expect(cotesApresSuppressionSommet([0], 1, 4)).toEqual([]); // un seul exclu : le côté fusionné est inclus
    expect(cotesApresSuppressionSommet([3], 1, 4)).toEqual([2]); // renumérotation
    expect(cotesApresSuppressionSommet([3, 0], 0, 4)).toEqual([2]); // sommet 0 : côtés 3 et 0 fusionnés en dernier côté
    expect(cotesApresSuppressionSommet([2], 0, 4)).toEqual([1]);
  });

  it("cercle : aire en m²", () => {
    const c = el({ type: "cercle", centre: [0, 0], rayon: 2 }, { materiau_id: "gazon" });
    expect(quantiteElement(c, GAZON)).toBeCloseTo(Math.PI * 4, 6);
  });

  it("totaux par matériau, ordre de la bibliothèque, éléments sans matériau ou supprimés ignorés", () => {
    const els = [
      el({ type: "polygone", points: rect(0, 0, 2, 2) }, { materiau_id: "gazon" }),
      el({ type: "polygone", points: rect(5, 0, 1, 3) }, { materiau_id: "gazon" }),
      el({ type: "polygone", points: rect(0, 5, 2, 2) }, { materiau_id: "ecorce" }),
      el({ type: "polygone", points: rect(9, 9, 2, 2) }),
      { ...el({ type: "polygone", points: rect(9, 9, 2, 2) }, { materiau_id: "gazon" }), statut: "supprime" as const },
      el({ type: "polyligne", points: [[0, 0], [1, 0]] }, { materiau_id: "gazon" }, "limite"), // incompatible
    ];
    expect(quantitesMateriaux(els, MATERIAUX).map((l) => [l.materiau.id, l.quantite, l.elements, l.montant])).toEqual([
      ["ecorce", 4, 1, null], ["gazon", 7, 2, 87.5],
    ]);
  });

  it("compatibilité : surface sur contour fermé, linéaire sur tracé (les bordures sont des tracés liés)", () => {
    const tracé = el({ type: "polyligne", points: [[0, 0], [1, 0]] }, {}, "limite");
    const poly = el({ type: "polygone", points: rect(0, 0, 1, 1) });
    expect(materiauCompatible(tracé, GAZON)).toBe(false);
    expect(materiauCompatible(tracé, VOLIGE)).toBe(true);
    expect(materiauCompatible(poly, VOLIGE)).toBe(false);
  });
});

describe("masque du rendu : éléments portant un matériau", () => {
  it("inclut une surface de gazon rénové hors du massif", () => {
    const gazon = el({ type: "polygone", points: rect(20, 0, 5, 4) }, { materiau_id: "gazon" });
    const contours = contoursMasqueMateriaux([gazon, el({ type: "polygone", points: rect(40, 0, 5, 4) })], MATERIAUX);
    expect(contours).toEqual([gazon.geometrie.type === "polygone" ? gazon.geometrie.points : []]);
  });

  it("linéaire : bande d'au moins 30 cm le long du tracé", () => {
    const t = el({ type: "polyligne", points: [[0, 4], [10, 4], [10, 0]] }, { materiau_id: "volige" }, "limite");
    const bandes = contoursMasqueMateriaux([t], MATERIAUX);
    expect(bandes.length).toBe(2);
    const dans = (p: Pt) => bandes.some((b) => pointDansPolygone(p, b));
    expect(dans([5, 4.1])).toBe(true);
    expect(dans([5, 4.2])).toBe(false);
    expect(dans([5, 0])).toBe(false);
    expect(dans([10.1, 2])).toBe(true);
  });
});

describe("position par rapport au massif, vue depuis la caméra", () => {
  // Caméra au sud, regardant vers le nord : u = x / 20, distance = y
  const projeter: ProjeterVue = (p) => ({ u: p[0] / 20, distance: p[1] });
  it("gauche / droite et premier plan / arrière-plan", () => {
    expect(positionRelative([2, 3], [10, 10], projeter)).toBe("à gauche du massif, devant le massif, au premier plan");
    expect(positionRelative([18, 10], [10, 10], projeter)).toBe("à droite du massif");
    expect(positionRelative([10, 15], [10, 10], projeter)).toBe("derrière le massif");
    expect(positionRelative([10, 10.5], [10, 10], projeter)).toBe("dans le massif ou en bordure immédiate");
  });

  it("description agrégée par matériau et position, hors champ ignoré", () => {
    const p2: ProjeterVue = (p) => (p[1] < 0 ? null : projeter(p));
    const d = decrireMateriaux([
      el({ type: "polygone", points: rect(0, 1, 5, 4) }, { materiau_id: "gazon" }),
      el({ type: "polygone", points: rect(0, -9, 5, 4) }, { materiau_id: "gazon" }),
    ], MATERIAUX, [10, 10], p2);
    expect(d).toEqual([{ nom: "Gazon (rénovation)", description: "desc gazon", quantite: 20, unite: "m2", position: "à gauche du massif, devant le massif, au premier plan" }]);
  });
});

describe("massifs sans matériau de sol (avertissement avant le rendu)", () => {
  const plante = (x: number, y: number, statut: Element["statut"] = "nouveau"): Element => ({
    id: `p${x}-${y}`, type: "vegetal", geometrie: { type: "point", position: [x, y] }, calque: "vegetal", statut, hauteur: 1, proprietes: {}, ordre: 0,
  });
  it("surface avec des plantes et sans paillage : signalée ; avec un paillage : non", () => {
    const sans = el({ type: "polygone", points: rect(0, 0, 4, 4) });
    const avec = el({ type: "polygone", points: rect(10, 0, 4, 4) }, { materiau_id: "ecorce" });
    const vide = el({ type: "polygone", points: rect(20, 0, 4, 4) });
    const r = massifsSansSol([sans, avec, vide, plante(2, 2), plante(12, 2), plante(22, 2, "existant")], MATERIAUX);
    expect(r.surfaces.map((s) => s.id)).toEqual([sans.id]);
    expect(r.zoneSeule).toBe(false);
  });
  it("zone active : des plantes hors de toute surface tracée", () => {
    const zone: Pt[] = rect(0, 0, 10, 10);
    expect(massifsSansSol([plante(5, 5)], MATERIAUX, zone)).toEqual({ surfaces: [], zoneSeule: true });
    expect(massifsSansSol([plante(5, 5), el({ type: "polygone", points: rect(4, 4, 2, 2) }, { materiau_id: "ecorce" })], MATERIAUX, zone).zoneSeule).toBe(false);
  });
});
