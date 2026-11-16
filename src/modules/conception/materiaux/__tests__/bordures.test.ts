import { describe, it, expect } from "vitest";
import type { Element } from "../../types";
import type { Pt } from "../../geo/plan";
import { decouperPolygone } from "../../geo/decoupe";
import { surface } from "../../geo/plan";
import { quantitesMateriaux, type Materiau } from "../materiaux";
import { creerBordures, borduresRecalculees, borduresApresDecoupe, suitesContigues, cheminBordure, cotesOccupes } from "../bordures";

const mat = (id: string, o: Partial<Materiau>): Materiau => ({
  id, nom: id, type: "lineaire", description_ia: id, couleur: "#444444", hachure: "aucune",
  unite: "ml", prix_unitaire: null, largeur_m: 0.02, ordre: 0, ...o,
});
const VOLIGE = mat("volige", { nom: "Volige acier", ordre: 1 });
const PIERRE = mat("pierre", { nom: "Bordure pierre", largeur_m: 0.12, ordre: 2 });
const MATERIAUX = [VOLIGE, PIERRE];

let n = 0;
const genererId = () => `b${n++}`;
const surfaceRect = (points: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]]): Element => ({
  id: "surface", type: "sol", geometrie: { type: "rectangle", points }, calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 0,
});
const creer = (s: Element, cotes: number[], materiauId: string, existants: Element[] = []) => {
  const r = creerBordures({ surface: s, cotes, materiauId, existants, genererId, ordre: 10 });
  if (!r.ok) throw new Error(r.erreur);
  return r.elements;
};

describe("bordures liées aux côtés d'une surface", () => {
  it("rectangle 10 × 4 avec volige sur un grand côté et un petit côté = 14 ml", () => {
    const b = creer(surfaceRect(), [0, 1], "volige");
    expect(b.length).toBe(1); // côtés contigus : une seule bordure
    expect(b[0].geometrie).toEqual({ type: "polyligne", points: [[0, 0], [10, 0], [10, 4]] });
    expect(quantitesMateriaux(b, MATERIAUX).map((l) => [l.materiau.nom, l.quantite])).toEqual([["Volige acier", 14]]);
  });

  it("côtés non contigus : une bordure par suite, toutes liées à la surface", () => {
    const b = creer(surfaceRect(), [0, 2], "volige");
    expect(b.length).toBe(2);
    expect(b.every((x) => x.proprietes.bordure_de === "surface")).toBe(true);
    expect(quantitesMateriaux(b, MATERIAUX)[0].quantite).toBe(20);
    // Suite qui passe par le sommet 0 : côtés 3 et 0 réunis
    expect(suitesContigues([3, 0, 1], 4)).toEqual([[3, 0, 1]]);
    expect(cheminBordure([[0, 0], [10, 0], [10, 4], [0, 4]], [3, 0])).toEqual([[0, 4], [0, 0], [10, 0]]);
  });

  it("deux bordures de matériaux différents sur la même surface ; un côté ne porte qu'une bordure", () => {
    const s = surfaceRect();
    const volige = creer(s, [0], "volige");
    const pierre = creer(s, [2], "pierre", volige);
    expect(quantitesMateriaux([...volige, ...pierre], MATERIAUX).map((l) => [l.materiau.nom, l.quantite])).toEqual([
      ["Volige acier", 10], ["Bordure pierre", 10],
    ]);
    expect([...cotesOccupes(s, [...volige, ...pierre]).keys()].sort()).toEqual([0, 2]);
    const refus = creerBordures({ surface: s, cotes: [2, 3], materiauId: "volige", existants: [...volige, ...pierre], genererId, ordre: 0 });
    expect(refus).toEqual({ ok: false, erreur: "Ce côté porte déjà une bordure." });
  });

  it("modification du contour → longueur de la bordure mise à jour", () => {
    const s = surfaceRect();
    const [b] = creer(s, [0, 1], "volige");
    const etiree = surfaceRect([[0, 0], [12, 0], [12, 4], [0, 4]]); // sommets 1 et 2 déplacés de 2 m
    const [maj] = borduresRecalculees({ bordure: b, surface: etiree, genererId });
    expect(maj.id).toBe(b.id);
    expect(quantitesMateriaux([maj], MATERIAUX)[0].quantite).toBe(16);
  });

  it("sommet inséré ou supprimé : côtés renumérotés, la bordure suit", () => {
    const s = surfaceRect();
    const [b] = creer(s, [1], "volige"); // côté est
    const avecSommet = surfaceRect([[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]]); // sommet inséré sur le côté 0
    const [maj] = borduresRecalculees({ bordure: b, surface: avecSommet, changement: { type: "insertion", cote: 0 }, genererId });
    expect(maj.proprietes.cotes).toEqual([2]);
    expect(maj.geometrie).toEqual({ type: "polyligne", points: [[10, 0], [10, 4]] });
    const sansSommet = borduresRecalculees({ bordure: maj, surface: s, changement: { type: "suppression", sommet: 1, nAvant: 5 }, genererId });
    expect(sansSommet[0].proprietes.cotes).toEqual([1]);
  });

  it("découpe de la surface : chaque partie garde les bordures de ses côtés", () => {
    const s = surfaceRect();
    const [b] = creer(s, [0], "volige"); // côté sud, 10 m, coupé en deux
    const r = decouperPolygone((s.geometrie as { points: Pt[] }).points, [[3, -1], [3, 5]]);
    if (!r.ok) throw new Error(r.erreur);
    expect(surface(r.parties[0].points) + surface(r.parties[1].points)).toBeCloseTo(40, 9);
    const apres = borduresApresDecoupe({ bordures: [b], parties: r.parties, idsParties: ["A", "B"], genererId });
    expect(apres.length).toBe(2);
    expect(apres[0].id).toBe(b.id);
    expect(new Set(apres.map((x) => x.proprietes.bordure_de))).toEqual(new Set(["A", "B"]));
    // La longueur totale de volige est conservée
    expect(quantitesMateriaux(apres, MATERIAUX)[0].quantite).toBe(10);
  });

  it("surface non bordable ou aucun côté : message clair", () => {
    const cercle: Element = { ...surfaceRect(), geometrie: { type: "cercle", centre: [0, 0], rayon: 2 } };
    expect(creerBordures({ surface: cercle, cotes: [0], materiauId: "volige", existants: [], genererId, ordre: 0 }).ok).toBe(false);
    expect(creerBordures({ surface: surfaceRect(), cotes: [], materiauId: "volige", existants: [], genererId, ordre: 0 }))
      .toEqual({ ok: false, erreur: "Choisissez au moins un côté de la surface." });
  });
});
