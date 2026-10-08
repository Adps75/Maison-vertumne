import { describe, it, expect } from "vitest";
import { genererCourbes } from "../courbes";

describe("genererCourbes", () => {
  it("terrain plat → aucune courbe", () => {
    const alt = () => 0;
    const courbes = genererCourbes(alt, [0, 0, 10, 10], 0.25, 1);
    expect(courbes).toHaveLength(0);
  });

  it("plan incliné → courbes parallèles", () => {
    // z = 0.1 * x → pente douce de 0 à 1 m sur 10 m
    const alt = (x: number) => 0.1 * x;
    const courbes = genererCourbes(alt, [0, 0, 10, 10], 0.25, 0.5);
    // On s'attend à des courbes à 0.25, 0.50, 0.75 (1.00 est au bord)
    expect(courbes.length).toBeGreaterThanOrEqual(3);
    // Chaque courbe a des points
    for (const c of courbes) {
      expect(c.points.length).toBeGreaterThanOrEqual(2);
    }
    // Les altitudes sont des multiples de 0.25
    const altitudes = new Set(courbes.map((c) => c.altitude));
    expect(altitudes.has(0.25)).toBe(true);
    expect(altitudes.has(0.5)).toBe(true);
    expect(altitudes.has(0.75)).toBe(true);
  });

  it("emprise trop petite → tableau vide", () => {
    const alt = (x: number) => x;
    // Emprise plus petite qu'une seule cellule → colonnes ou lignes < 2
    const courbes = genererCourbes(alt, [0, 0, 0.2, 0.2], 0.25, 1);
    expect(courbes).toHaveLength(0);
  });
});
