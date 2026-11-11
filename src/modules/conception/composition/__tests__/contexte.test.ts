import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import {
  dimensionsEtForme, exposition, pente, devantDuMassif, plantesAutour, azimut, cardinal, centroide,
} from "../contexte";

const RECT: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
const carre = (cx: number, cy: number, c: number): Pt[] => [[cx - c, cy - c], [cx + c, cy - c], [cx + c, cy + c], [cx - c, cy + c]];

describe("dimensions et forme", () => {
  it("rectangle 10 × 4", () => {
    expect(dimensionsEtForme(RECT)).toEqual({ surface_m2: 40, longueur_m: 10, largeur_m: 4, forme: "rectangulaire" });
  });
  it("rectangle tourné : mêmes dimensions", () => {
    const a = Math.PI / 6;
    const rot = RECT.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as Pt);
    const d = dimensionsEtForme(rot);
    expect(d.longueur_m).toBeCloseTo(10, 1);
    expect(d.largeur_m).toBeCloseTo(4, 1);
  });
  it("bande allongée, disque, forme en L", () => {
    expect(dimensionsEtForme([[0, 0], [12, 0], [12, 1.5], [0, 1.5]]).forme).toBe("allongee");
    const disque = Array.from({ length: 48 }, (_, i) => [3 * Math.cos(i * Math.PI / 24), 3 * Math.sin(i * Math.PI / 24)] as Pt);
    expect(dimensionsEtForme(disque).forme).toBe("circulaire");
    expect(dimensionsEtForme([[0, 0], [12, 0], [12, 3], [4, 3], [4, 8], [0, 8]]).forme).toBe("irreguliere");
  });
});

describe("orientation", () => {
  it("azimut et points cardinaux (y = nord)", () => {
    expect(azimut([0, 0], [0, 5])).toBeCloseTo(0);
    expect(azimut([0, 0], [5, 0])).toBeCloseTo(90);
    expect(azimut([0, 0], [0, -5])).toBeCloseTo(180);
    expect(cardinal(181)).toBe("sud");
    expect(cardinal(310)).toBe("nord-ouest");
  });
  it("centroïde du rectangle", () => {
    expect(centroide(RECT)).toEqual([5, 2]);
  });
});

describe("exposition", () => {
  // Massif centré en (5, 2)
  it("sans bâtiment : plein soleil", () => {
    expect(exposition(RECT, []).exposition).toBe("plein_soleil");
  });
  it("maison de 7 m juste au sud : ombre", () => {
    const e = exposition(RECT, [{ contour: [[0, -10], [10, -10], [10, -3], [0, -3]], hauteur: 7 }]);
    expect(e.exposition).toBe("ombre");
    expect(e.detailExposition).toContain("sud");
  });
  it("maison au sud mais plus loin : mi-ombre", () => {
    expect(exposition(RECT, [{ contour: [[0, -20], [10, -20], [10, -14], [0, -14]], hauteur: 7 }]).exposition).toBe("mi_ombre");
  });
  it("maison au nord : plein soleil", () => {
    expect(exposition(RECT, [{ contour: [[0, 6], [10, 6], [10, 12], [0, 12]], hauteur: 7 }]).exposition).toBe("plein_soleil");
  });
  it("maison proche à l'est : mi-ombre le matin", () => {
    const e = exposition(RECT, [{ contour: carre(14, 2, 2), hauteur: 7 }]);
    expect(e.exposition).toBe("mi_ombre");
    expect(e.detailExposition).toContain("matin");
  });
});

describe("pente", () => {
  it("terrain plat ou sans relief : null", () => {
    expect(pente(RECT, null)).toBeNull();
    expect(pente(RECT, () => 3)).toBeNull();
  });
  it("10 % descendant vers le sud", () => {
    const p = pente(RECT, (_x, y) => 0.1 * y)!;
    expect(p.pourcent).toBeCloseTo(10, 0);
    expect(p.descendVers).toBe("sud");
  });
  it("5 % descendant vers l'est", () => {
    const p = pente(RECT, (x) => -0.05 * x)!;
    expect(p.pourcent).toBeCloseTo(5, 0);
    expect(p.descendVers).toBe("est");
  });
});

describe("devant du massif", () => {
  const maisonNord = { contour: [[0, 8], [10, 8], [10, 14], [0, 14]] as Pt[], hauteur: 7 };

  it("vue calée : devant tourné vers la vue la plus proche", () => {
    const r = devantDuMassif(RECT, [
      { nom: "Vue 1", position: [5, -10], calee: true },
      { nom: "Vue lointaine", position: [40, 2], calee: true },
      { nom: "Non calée", position: [5, 3], calee: false },
    ], [maisonNord]);
    expect(r.devant.source).toBe("vue");
    expect(r.vuePrincipale).toBe("Vue 1");
    expect(r.versDevant[0]).toBeCloseTo(0, 6);
    expect(r.versDevant[1]).toBeCloseTo(-1, 6);
  });
  it("sans vue : vers la façade la plus proche", () => {
    const r = devantDuMassif(RECT, [], [maisonNord]);
    expect(r.devant.source).toBe("facade");
    expect(r.versDevant[1]).toBeCloseTo(1, 6);
  });
  it("ni vue ni façade : vers le sud", () => {
    expect(devantDuMassif(RECT, [], []).versDevant).toEqual([0, -1]);
  });
});

describe("plantes existantes", () => {
  it("dans le massif et à moins de 5 m autour", () => {
    const r = plantesAutour(RECT, [
      { position: [5, 2], nom_latin: "Dedans", nom_commun: "a" },
      { position: [5, 7], nom_latin: "Proche", nom_commun: "b" },
      { position: [5, 20], nom_latin: "Loin", nom_commun: "c" },
    ]);
    expect(r).toEqual([
      { nom_latin: "Dedans", nom_commun: "a", dansMassif: true, distance_m: 0 },
      { nom_latin: "Proche", nom_commun: "b", dansMassif: false, distance_m: 3 },
    ]);
  });
});
