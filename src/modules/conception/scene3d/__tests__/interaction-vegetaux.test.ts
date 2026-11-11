import { describe, it, expect } from "vitest";
import { threeVersPlan } from "../interaction-vegetaux";
import { planVers3D } from "../conversion";

describe("threeVersPlan", () => {
  it("inverse planVers3D sur terrain plat", () => {
    const [tx, , tz] = planVers3D(5, 10, 0);
    const [planX, planY] = threeVersPlan(tx, tz);
    expect(planX).toBeCloseTo(5);
    expect(planY).toBeCloseTo(10);
  });

  it("inverse planVers3D avec altitude", () => {
    const [tx, ty, tz] = planVers3D(12, 8, 2.5);
    // La hauteur (ty) n'affecte pas la conversion plan
    const [planX, planY] = threeVersPlan(tx, tz);
    expect(planX).toBeCloseTo(12);
    expect(planY).toBeCloseTo(8);
    expect(ty).toBeCloseTo(2.5);
  });

  it("coordonnées négatives", () => {
    const [tx, , tz] = planVers3D(-3, -7, 0);
    const [planX, planY] = threeVersPlan(tx, tz);
    expect(planX).toBeCloseTo(-3);
    expect(planY).toBeCloseTo(-7);
  });

  it("aller-retour sur terrain incliné", () => {
    // Simuler un terrain incliné : l'altitude ne change pas les coordonnées XZ
    const x = 15, y = 20, alt = 3.7;
    const [tx, , tz] = planVers3D(x, y, alt);
    const [px, py] = threeVersPlan(tx, tz);
    expect(px).toBeCloseTo(x);
    expect(py).toBeCloseTo(y);
  });
});
