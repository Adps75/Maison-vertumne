import { describe, it, expect } from "vitest";
import { geometrieBande, uvMonde } from "../materiaux3d";

describe("matériaux en 3D", () => {
  it("volige de 5 m : bande à sa position, sa largeur et sa hauteur, sur le relief", () => {
    const alt = (x: number) => 0.1 * x; // pente de 10 % vers l'est
    const g = geometrieBande([[0, 0], [5, 0]], 0.02, 0.05, alt);
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (let i = 0; i < g.positions.length; i += 3) { xs.push(g.positions[i]); ys.push(g.positions[i + 1]); zs.push(g.positions[i + 2]); }
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.02, 6); // largeur (z = -y)
    // Dessus à 5 cm au-dessus du sol en chaque point, base enterrée de 2 cm
    for (let i = 0; i < xs.length; i++) {
      const sol = alt(xs[i]);
      expect([sol - 0.02, sol + 0.05].some((h) => Math.abs(ys[i] - h) < 1e-9)).toBe(true);
    }
    expect(g.indices.length).toBeGreaterThan(0);
    expect(Math.max(...g.indices)).toBeLessThan(xs.length);
  });

  it("tracé brisé : un échantillon tous les 25 cm, sans doublon aux angles", () => {
    const g = geometrieBande([[0, 0], [1, 0], [1, 1]], 0.1, 0.1, () => 0);
    expect(g.positions.length / 3 / 4).toBe(9); // 5 + 4 échantillons
  });

  it("texture à l'échelle réelle : u = x / taille, v = y plan / taille", () => {
    expect(uvMonde([1.2, 0, -0.6], 0.6)).toEqual([2, 1]);
  });
});
