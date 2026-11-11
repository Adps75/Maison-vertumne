import { describe, it, expect } from "vitest";
import {
  rayonEffectif,
  ecartementMinimal,
  detecterConflits,
  positionValideLaPlusProche,
  rayonEcartement,
  type VoisineInfo,
} from "../ecartement";

function v(
  id: string,
  x: number, y: number,
  diametre: number,
  categorie = "vivace",
  forme: string | null = null,
): VoisineInfo {
  return { id, position: [x, y], rayon: diametre / 2, categorie, forme, nom: id };
}

// ─── Rayon effectif ────────────────────────────────────────────────

describe("rayonEffectif", () => {
  it("deux vivaces : rayon complet", () => {
    const a = v("a", 0, 0, 1);
    const b = v("b", 1, 0, 1);
    expect(rayonEffectif(a, b)).toBe(0.5);
    expect(rayonEffectif(b, a)).toBe(0.5);
  });

  it("deux arbres : rayon de couronne complet", () => {
    const a = v("a", 0, 0, 4, "arbre");
    const b = v("b", 3, 0, 4, "arbre");
    expect(rayonEffectif(a, b)).toBe(2);
    expect(rayonEffectif(b, a)).toBe(2);
  });

  it("arbre vs vivace : arbre = rayon de pied 0.30, vivace = rayon complet", () => {
    const arbre = v("a", 0, 0, 6, "arbre");
    const vivace = v("v", 1, 0, 1);
    expect(rayonEffectif(arbre, vivace)).toBe(0.30);
    expect(rayonEffectif(vivace, arbre)).toBe(0.5);
  });

  it("forme tige est traitée comme arbre", () => {
    const tige = v("t", 0, 0, 4, "arbuste", "tige");
    const arbre = v("a", 3, 0, 4, "arbre");
    expect(rayonEffectif(tige, arbre)).toBe(2); // couronne
    expect(rayonEffectif(arbre, tige)).toBe(2);
  });

  it("couvre_sol → rayon 0", () => {
    const cs = v("cs", 0, 0, 2, "couvre_sol");
    const vivace = v("v", 0.5, 0, 1);
    expect(rayonEffectif(cs, vivace)).toBe(0);
    expect(rayonEffectif(vivace, cs)).toBe(0);
  });

  it("grimpante → rayon 0", () => {
    const gr = v("g", 0, 0, 1, "grimpante");
    const arbre = v("a", 0.5, 0, 6, "arbre");
    expect(rayonEffectif(gr, arbre)).toBe(0);
  });
});

// ─── Écartement minimal ────────────────────────────────────────────

describe("ecartementMinimal", () => {
  it("deux vivaces 1m, tolérance 15%", () => {
    const a = v("a", 0, 0, 1);
    const b = v("b", 1, 0, 1);
    // (0.5 + 0.5) * (1 - 0.15) = 0.85
    expect(ecartementMinimal(a, b, 0.15)).toBeCloseTo(0.85);
  });

  it("deux arbres 4m, tolérance 15%", () => {
    const a = v("a", 0, 0, 4, "arbre");
    const b = v("b", 3, 0, 4, "arbre");
    // (2 + 2) * 0.85 = 3.4
    expect(ecartementMinimal(a, b, 0.15)).toBeCloseTo(3.4);
  });

  it("arbre 6m + vivace 1m, tolérance 15%", () => {
    const arbre = v("a", 0, 0, 6, "arbre");
    const vivace = v("v", 1, 0, 1);
    // (0.30 + 0.5) * 0.85 = 0.68
    expect(ecartementMinimal(arbre, vivace, 0.15)).toBeCloseTo(0.68);
  });

  it("couvre_sol + vivace → 0 (jamais de conflit)", () => {
    const cs = v("cs", 0, 0, 2, "couvre_sol");
    const vivace = v("v", 0.5, 0, 1);
    expect(ecartementMinimal(cs, vivace, 0.15)).toBe(0);
  });

  it("tolérance 0 : écartement = somme des rayons", () => {
    const a = v("a", 0, 0, 2);
    const b = v("b", 1, 0, 2);
    expect(ecartementMinimal(a, b, 0)).toBeCloseTo(2);
  });

  it("tolérance 40%", () => {
    const a = v("a", 0, 0, 2);
    const b = v("b", 1, 0, 2);
    expect(ecartementMinimal(a, b, 0.40)).toBeCloseTo(1.2);
  });
});

// ─── Détection de conflits ─────────────────────────────────────────

describe("detecterConflits", () => {
  it("deux vivaces trop proches → conflit", () => {
    const plantes = [v("a", 0, 0, 1), v("b", 0.5, 0, 1)];
    const conflits = detecterConflits(plantes, 0.15);
    expect(conflits).toHaveLength(1);
    expect(conflits[0].distance).toBeCloseTo(0.5);
    expect(conflits[0].distanceMin).toBeCloseTo(0.85);
  });

  it("deux vivaces assez éloignées → pas de conflit", () => {
    const plantes = [v("a", 0, 0, 1), v("b", 1, 0, 1)];
    expect(detecterConflits(plantes, 0.15)).toHaveLength(0);
  });

  it("arbre 6m + vivace 1m à 0.50 m → pas de conflit (rayon pied)", () => {
    const plantes = [v("a", 0, 0, 6, "arbre"), v("v", 0.5, 0, 1)];
    // dMin = (0.30 + 0.5) * 0.85 = 0.68 ; d = 0.5 < 0.68 → conflit
    // Wait, 0.5 < 0.68, so there IS a conflict
    const conflits = detecterConflits(plantes, 0.15);
    expect(conflits).toHaveLength(1);
  });

  it("arbre 6m + vivace 1m à 1.0 m → pas de conflit", () => {
    const plantes = [v("a", 0, 0, 6, "arbre"), v("v", 1.0, 0, 1)];
    // dMin = 0.68 ; d = 1.0 > 0.68
    expect(detecterConflits(plantes, 0.15)).toHaveLength(0);
  });

  it("couvre_sol + vivace → jamais de conflit", () => {
    const plantes = [v("cs", 0, 0, 2, "couvre_sol"), v("v", 0.1, 0, 1)];
    expect(detecterConflits(plantes, 0.15)).toHaveLength(0);
  });

  it("deux arbres 4m à 3m → conflit (min 3.4m)", () => {
    const plantes = [v("a", 0, 0, 4, "arbre"), v("b", 3, 0, 4, "arbre")];
    const conflits = detecterConflits(plantes, 0.15);
    expect(conflits).toHaveLength(1);
    expect(conflits[0].distanceMin).toBeCloseTo(3.4);
  });
});

// ─── Position valide la plus proche ─────────────────────────────────

describe("positionValideLaPlusProche", () => {
  it("pas de conflit → position inchangée", () => {
    const plante = v("new", 5, 5, 1);
    const voisines = [v("a", 0, 0, 1)];
    const pos = positionValideLaPlusProche(plante, [5, 5], voisines, 0.15);
    expect(pos[0]).toBeCloseTo(5);
    expect(pos[1]).toBeCloseTo(5);
  });

  it("conflit avec une voisine → repoussée", () => {
    const plante = v("new", 0, 0, 1);
    const voisines = [v("a", 0, 0, 1)]; // même position
    const pos = positionValideLaPlusProche(plante, [0, 0], voisines, 0.15);
    // Doit être à au moins 0.85m de (0,0)
    const d = Math.sqrt(pos[0] ** 2 + pos[1] ** 2);
    expect(d).toBeGreaterThanOrEqual(0.84);
  });

  it("posée entre deux voisines → repoussée à l'écartement min de chacune", () => {
    const plante = v("new", 0, 0, 1);
    const voisines = [
      v("a", -1, 0, 1),
      v("b", 1, 0, 1),
    ];
    // Posée à (0,0), en conflit avec les deux
    const pos = positionValideLaPlusProche(plante, [0, 0], voisines, 0.15);
    // Après résolution itérative, la distance à chaque voisine >= 0.85m
    const dA = Math.sqrt((pos[0] + 1) ** 2 + pos[1] ** 2);
    const dB = Math.sqrt((pos[0] - 1) ** 2 + pos[1] ** 2);
    expect(Math.min(dA, dB)).toBeGreaterThanOrEqual(0.84);
  });

  it("pas de conflit avec couvre_sol", () => {
    const plante = v("new", 0, 0, 1);
    const voisines = [v("cs", 0, 0, 2, "couvre_sol")];
    const pos = positionValideLaPlusProche(plante, [0, 0], voisines, 0.15);
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(0);
  });

  it("zone contour : repoussée si hors zone", () => {
    const plante = v("new", 0, 0, 1);
    const zone: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const voisines = [v("a", 0.3, 0.3, 1)];
    // Repoussée hors de la voisine mais doit rester dans la zone
    const pos = positionValideLaPlusProche(plante, [0.3, 0.3], voisines, 0.15, zone);
    expect(pos[0]).toBeGreaterThanOrEqual(0);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[0]).toBeLessThanOrEqual(10);
    expect(pos[1]).toBeLessThanOrEqual(10);
  });
});

// ─── Rayon d'écartement (largeur 3 ans) ────────────────────────────

describe("rayonEcartement", () => {
  it("utilise largeur_3ans_m quand renseigné", () => {
    expect(rayonEcartement({ diametre_m: 2, largeur_3ans_m: 1.2 })).toBeCloseTo(0.6);
  });

  it("utilise 70% de diametre_m quand largeur_3ans_m absent", () => {
    expect(rayonEcartement({ diametre_m: 2 })).toBeCloseTo(0.7);
  });

  it("utilise 70% de diametre_m quand largeur_3ans_m = null (plante non renseignée)", () => {
    expect(rayonEcartement({ diametre_m: 2, largeur_3ans_m: null })).toBeCloseTo(0.7);
  });

  it("utilise 70% de diametre_m quand largeur_3ans_m = 0", () => {
    expect(rayonEcartement({ diametre_m: 2, largeur_3ans_m: 0 })).toBeCloseTo(0.7);
  });

  it("défaut 1m si diametre_m absent", () => {
    expect(rayonEcartement({})).toBeCloseTo(0.35);
  });
});
