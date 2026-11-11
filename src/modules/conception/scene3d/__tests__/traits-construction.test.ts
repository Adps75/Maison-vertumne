import { describe, it, expect } from "vitest";
import type { Calque, Element, Geometrie } from "../../types";
import {
  selectionnerTraits, draperLigne, geometrieEnLigne, selectionParDefaut, calquesDeDessin,
  CLE_ZONE_ACTIVE, HAUTEUR_TRAITS,
} from "../traits-construction";

const CALQUES: Calque[] = [
  { nom: "topographie", visible: true, verrouille: false, couleur: "#8B6914" },
  { nom: "zones", visible: true, verrouille: false, couleur: "#9C7C3C" },
  { nom: "sols", visible: true, verrouille: false, couleur: "#E07830" },
  { nom: "mineral", visible: false, verrouille: false, couleur: "#50B8E0" },
  { nom: "vegetal", visible: true, verrouille: false, couleur: "#40D870" },
];

let n = 0;
function el(type: Element["type"], calque: string, geometrie: Geometrie, statut: Element["statut"] = "nouveau"): Element {
  return { id: `e${++n}`, type, calque, geometrie, statut, hauteur: null, proprietes: {}, ordre: n };
}

const carre: Geometrie = { type: "polygone", points: [[0, 0], [4, 0], [4, 4], [0, 4]] };

describe("selectionnerTraits", () => {
  const massif = el("sol", "sols", carre);
  const allee = el("mineral", "mineral", { type: "polyligne", points: [[0, 0], [10, 0]] });
  const zone = el("zone", "zones", { type: "polygone", points: [[-1, -1], [11, -1], [11, 11], [-1, 11]] });
  const autreZone = el("zone", "zones", carre);
  const plante = el("vegetal", "vegetal", { type: "point", position: [2, 2] });
  const pointCote = el("point_cote", "topographie", { type: "point", position: [1, 1] });
  const cote = el("cote", "sols", { type: "cote", p1: [0, 0], p2: [1, 0], decalage: 0.5, distance: 1 });
  const supprime = el("sol", "sols", carre, "supprime");
  const tous = [massif, allee, zone, autreZone, plante, pointCote, cote, supprime];

  it("retient les tracés des calques cochés et la zone active, à la couleur du calque", () => {
    const traits = selectionnerTraits(tous, CALQUES, zone.id, new Set(["sols", "mineral", CLE_ZONE_ACTIVE]));
    expect(traits.map((t) => t.id).sort()).toEqual([massif.id, allee.id, zone.id].sort());
    expect(traits.find((t) => t.id === massif.id)!.couleur).toBe("#E07830");
    expect(traits.find((t) => t.id === zone.id)!.couleur).toBe("#9C7C3C");
    expect(traits.find((t) => t.id === massif.id)!.ferme).toBe(true);
    expect(traits.find((t) => t.id === allee.id)!.ferme).toBe(false);
  });

  it("exclut plantes, cotes, points cotés, éléments supprimés et zones non actives", () => {
    const traits = selectionnerTraits(tous, CALQUES, zone.id, new Set(["sols", "vegetal", "topographie", CLE_ZONE_ACTIVE]));
    const ids = traits.map((t) => t.id);
    for (const exclu of [plante, pointCote, cote, supprime, autreZone]) expect(ids).not.toContain(exclu.id);
  });

  it("calque décoché ou zone active décochée : non affichés", () => {
    const traits = selectionnerTraits(tous, CALQUES, zone.id, new Set(["mineral"]));
    expect(traits.map((t) => t.id)).toEqual([allee.id]);
  });

  it("aucune zone active : pas de contour de zone", () => {
    const traits = selectionnerTraits(tous, CALQUES, null, new Set([CLE_ZONE_ACTIVE]));
    expect(traits).toEqual([]);
  });
});

describe("selectionParDefaut / calquesDeDessin", () => {
  it("calques de dessin = tous sauf topographie et zones", () => {
    expect(calquesDeDessin(CALQUES).map((c) => c.nom)).toEqual(["sols", "mineral", "vegetal"]);
  });
  it("par défaut : calques de dessin visibles + zone active", () => {
    expect([...selectionParDefaut(CALQUES)].sort()).toEqual([CLE_ZONE_ACTIVE, "sols", "vegetal"].sort());
  });
});

describe("geometrieEnLigne", () => {
  it("cercle fermé, tous les points sur le rayon", () => {
    const l = geometrieEnLigne(el("sol", "sols", { type: "cercle", centre: [5, 5], rayon: 2 }))!;
    expect(l.ferme).toBe(true);
    expect(l.points.length).toBeGreaterThanOrEqual(72);
    for (const [x, y] of l.points) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(2, 9);
  });

  it("arc ouvert de 0° à 90° : extrémités exactes", () => {
    const l = geometrieEnLigne(el("sol", "sols", { type: "arc", centre: [0, 0], rayon: 3, angleDebut: 0, angleFin: 90 }))!;
    expect(l.ferme).toBe(false);
    expect(l.points[0][0]).toBeCloseTo(3); expect(l.points[0][1]).toBeCloseTo(0);
    const fin = l.points[l.points.length - 1];
    expect(fin[0]).toBeCloseTo(0); expect(fin[1]).toBeCloseTo(3);
  });

  it("arc qui passe par 0° (de 300° à 30°) : balayage de 90° dans le sens trigo", () => {
    const l = geometrieEnLigne(el("sol", "sols", { type: "arc", centre: [0, 0], rayon: 1, angleDebut: 300, angleFin: 30 }))!;
    const milieu = l.points[Math.floor(l.points.length / 2)];
    const angle = (Math.atan2(milieu[1], milieu[0]) * 180) / Math.PI;
    expect(angle).toBeCloseTo(-15, 6); // milieu de [300°, 390°] = 345° ≡ -15°
  });

  it("rectangle fermé, polyligne à un point ignorée", () => {
    expect(geometrieEnLigne(el("sol", "sols", { type: "rectangle", points: [[0, 0], [1, 0], [1, 1], [0, 1]] }))!.ferme).toBe(true);
    expect(geometrieEnLigne(el("sol", "sols", { type: "polyligne", points: [[0, 0]] }))).toBeNull();
  });
});

describe("draperLigne", () => {
  const pente = (x: number) => 0.1 * x;

  it("découpe tous les 25 cm et pose chaque point 2 cm au-dessus du relief", () => {
    const pts = draperLigne([[0, 0], [2, 0]], false, pente);
    expect(pts.length).toBe(9); // 0, 0.25, …, 2
    for (const [x, h, z] of pts) {
      expect(z === 0 ? 0 : z).toBe(0); // y plan = 0 → z Three.js = -0
      expect(h).toBeCloseTo(pente(x) + HAUTEUR_TRAITS, 9);
    }
  });

  it("ligne fermée : revient au premier point", () => {
    const pts = draperLigne([[0, 0], [1, 0], [1, 1]], true, () => 0);
    expect(pts[pts.length - 1]).toEqual(pts[0]);
  });

  it("convention Three.js : z = -y plan", () => {
    const pts = draperLigne([[3, 5], [3, 5.1]], false, () => 1);
    expect(pts[0]).toEqual([3, 1 + HAUTEUR_TRAITS, -5]);
  });
});
