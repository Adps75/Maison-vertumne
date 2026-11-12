import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import type { CameraParams } from "../../camera/types";
import { creerProjecteur } from "../../camera/projection";
import {
  grilleMassif, nomColonne, indiceColonne, lireCase, rectCase, centreCase, caseDuPoint, traitsGrille, decrireGrille,
} from "../grille";
import { projeterSol, vueVoitMassif, etiquettesProjetees, grilleProjetee, dansImage } from "../projection-vue";
import { rectsDesCases, zonesExclusion, distanceRect, dansExclusion, empriseDesCases } from "../exclusions";
import { placerComposition, type PlanteAPlacer } from "../placement";

const plat = () => 0;
// Massif 4 m × 4 m, 8 à 12 m au nord de la caméra
const MASSIF: Pt[] = [[-1, 8], [3, 8], [3, 12], [-1, 12]];

describe("grille de repères", () => {
  it("emprise du massif + 3 m, pas de 1 m, nord en haut", () => {
    const g = grilleMassif(MASSIF);
    expect(g).toEqual({ xMin: -4, yMax: 15, pas: 1, colonnes: 10, lignes: 10 });
    expect(decrireGrille(g)).toContain("A à J");
  });
  it("pas de 2 m au-delà de 15 m", () => {
    expect(grilleMassif([[0, 0], [16, 0], [16, 4], [0, 4]]).pas).toBe(2);
    expect(grilleMassif([[0, 0], [15, 0], [15, 4], [0, 4]]).pas).toBe(1);
  });
  it("lettres en colonnes, chiffres en lignes", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(nomColonne)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
    for (const i of [0, 7, 25, 26, 51, 80]) expect(indiceColonne(nomColonne(i))).toBe(i);
  });
  it("case ↔ carré du plan : A1 au nord-ouest, ligne 2 plus au sud", () => {
    const g = grilleMassif(MASSIF);
    expect(rectCase(g, 0, 0)).toEqual({ x0: -4, y0: 14, x1: -3, y1: 15 });
    expect(centreCase(g, 0, 1)).toEqual([-3.5, 13.5]);
    expect(caseDuPoint(g, [1.5, 10.5])).toBe("F5");
    expect(lireCase(g, "f5")).toEqual({ colonne: 5, ligne: 4 });
    expect(lireCase(g, "K1")).toBeNull(); // hors grille (10 colonnes)
    expect(lireCase(g, "A11")).toBeNull();
    expect(lireCase(g, "5F")).toBeNull();
    expect(caseDuPoint(g, [100, 100])).toBeNull();
  });
  it("traits : colonnes + 1 verticales, lignes + 1 horizontales", () => {
    expect(traitsGrille(grilleMassif(MASSIF)).length).toBe(11 + 11);
  });
});

describe("projection de la grille sur une photo calée", () => {
  // Caméra à l'origine, 1,60 m, regard horizontal vers le nord, champ vertical 50°, photo 800 × 600
  const CAM: CameraParams = { x: 0, y: 0, hauteur: 1.6, cap: 0, inclinaison: 0, roulis: 0, fov_v: 50 };
  const L = 800, H = 600;
  const projeter = creerProjecteur(CAM, plat, L, H);
  const tanV = Math.tan((25 * Math.PI) / 180);
  const tanH = tanV * (L / H);

  /** Sténopé : u, v attendus pour un point au sol (posé 2 cm au-dessus). */
  const attendu = ([x, y]: Pt) => ({ u: 0.5 + (x / y) / (2 * tanH), v: 0.5 + ((1.6 - 0.02) / y) / (2 * tanV) });

  it("le centre d'une case connue (F5) tombe au bon pixel", () => {
    const g = grilleMassif(MASSIF);
    const c = centreCase(g, 5, 4); // F5 = (1,5 ; 10,5)
    expect(c).toEqual([1.5, 10.5]);
    const p = projeterSol(c, projeter, plat)!;
    const a = attendu(c);
    expect(p.u * L).toBeCloseTo(a.u * L, 1);
    expect(p.v * H).toBeCloseTo(a.v * H, 1);
  });

  it("chaque étiquette retenue est au centre projeté de sa case", () => {
    const g = grilleMassif(MASSIF);
    const etiquettes = etiquettesProjetees(g, projeter, plat, L, H);
    expect(etiquettes.length).toBeGreaterThan(5);
    for (const e of etiquettes) {
      const lu = lireCase(g, e.texte)!;
      const a = attendu(centreCase(g, lu.colonne, lu.ligne));
      expect(e.u * L).toBeCloseTo(a.u * L, 1);
      expect(e.v * H).toBeCloseTo(a.v * H, 1);
    }
    // Les cases proches (bas de l'image) sont étiquetées en priorité
    expect(etiquettes.some((e) => e.texte === "F10")).toBe(true);
  });

  it("relief : une case en hauteur remonte dans l'image", () => {
    const pente = (_x: number, y: number) => 0.1 * y;
    const enPente = creerProjecteur(CAM, pente, L, H);
    const c = centreCase(grilleMassif(MASSIF), 5, 4);
    expect(projeterSol(c, enPente, pente)!.v).toBeLessThan(projeterSol(c, projeter, plat)!.v);
  });

  it("vue qui voit le massif / vue tournée à l'opposé", () => {
    expect(vueVoitMassif(MASSIF, projeter, plat)).toBe(true);
    const dos = creerProjecteur({ ...CAM, cap: 180 }, plat, L, H);
    expect(vueVoitMassif(MASSIF, dos, plat)).toBe(false);
    const cote = creerProjecteur({ ...CAM, cap: 90 }, plat, L, H);
    expect(vueVoitMassif(MASSIF, cote, plat)).toBe(false);
  });

  it("traits projetés : aucun point derrière la caméra, tronçons utilisables", () => {
    const traits = grilleProjetee(grilleMassif(MASSIF), projeter, plat);
    expect(traits.length).toBeGreaterThan(10);
    expect(traits.every((t) => t.length >= 2)).toBe(true);
    expect(traits.some((t) => t.some(dansImage))).toBe(true);
  });

  it("étiquettes : pas de chevauchement, cases lointaines non étiquetées", () => {
    const e = etiquettesProjetees(grilleMassif(MASSIF), projeter, plat, L, H);
    expect(e.length).toBeGreaterThan(5);
    for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) {
      const loin = Math.abs((e[i].u - e[j].u) * L) >= 30 || Math.abs((e[i].v - e[j].v) * H) >= 16;
      expect(loin).toBe(true);
    }
  });
});

describe("zones d'exclusion", () => {
  const g = grilleMassif(MASSIF);

  it("cases → carrés du plan, cases invalides ignorées, doublons retirés", () => {
    expect(rectsDesCases(g, ["F5", "f5", "Z99", "??", "G5"])).toEqual([
      { x0: 1, y0: 10, x1: 2, y1: 11 },
      { x0: 2, y0: 10, x1: 3, y1: 11 },
    ]);
    expect(zonesExclusion(g, [{ libelle: "If", cases: ["F5"] }, { libelle: "rien", cases: ["Z99"] }])).toEqual([
      { libelle: "If", rects: [{ x0: 1, y0: 10, x1: 2, y1: 11 }] },
    ]);
  });

  it("distance à un carré, et seuil du rayon", () => {
    const r = { x0: 0, y0: 0, x1: 1, y1: 1 };
    expect(distanceRect([0.5, 0.5], r)).toBe(0);
    expect(distanceRect([2, 0.5], r)).toBe(1);
    expect(distanceRect([4, 5], r)).toBe(5);
    expect(dansExclusion([1.3, 0.5], 0.35, [r])).toBe(true);
    expect(dansExclusion([1.4, 0.5], 0.35, [r])).toBe(false);
  });

  it("emprise d'un élément existant (pour l'ajouter au plan)", () => {
    expect(empriseDesCases(rectsDesCases(g, ["F5", "G5", "F6", "G6"]))).toEqual({ centre: [2, 10], diametre: 2 });
    expect(empriseDesCases([])).toBeNull();
  });

  it("le placement évite les zones d'exclusion et place quand même le reste", () => {
    const exclusions = rectsDesCases(g, ["E5", "F5", "E6", "F6"]); // 2 m × 2 m au centre du massif
    const plantes: PlanteAPlacer[] = [
      { cle: "a", rayon: 0.3, hauteur: 0.8, categorie: "vivace", forme: null, role: "masse", profondeur: "milieu", quantite: 12, tailleGroupe: 3, repetitions: 4 },
      { cle: "b", rayon: 0.2, hauteur: 0.4, categorie: "vivace", forme: null, role: "masse", profondeur: "devant", quantite: 10, tailleGroupe: 5, repetitions: 2 },
    ];
    const r = placerComposition({ contour: MASSIF, plantes, versDevant: [0, -1], geometrique: false, tolerance: 0.3, existantes: [], graine: 7, exclusions });
    expect(r.placements.length).toBeGreaterThan(10);
    const rayon = new Map(plantes.map((p) => [p.cle, p.rayon]));
    for (const pl of r.placements) {
      expect(dansExclusion(pl.position, rayon.get(pl.cle)!, exclusions)).toBe(false);
    }
    // Sans exclusion, des plantes occupent cette zone : la contrainte agit vraiment
    const libre = placerComposition({ contour: MASSIF, plantes, versDevant: [0, -1], geometrique: false, tolerance: 0.3, existantes: [], graine: 7 });
    expect(libre.placements.some((pl) => dansExclusion(pl.position, rayon.get(pl.cle)!, exclusions))).toBe(true);
  });
});
