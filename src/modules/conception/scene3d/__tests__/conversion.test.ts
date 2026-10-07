import { describe, it, expect } from "vitest";
import { planVers3D, pointsPlanVersShape } from "../conversion";

describe("planVers3D", () => {
  it("convertit un point avec hauteur", () => {
    expect(planVers3D(10, 20, 5)).toEqual([10, 5, -20]);
  });

  it("retourne hauteur 0 par défaut", () => {
    expect(planVers3D(10, 20)).toEqual([10, 0, -20]);
  });

  it("gère l'origine (0, 0)", () => {
    expect(planVers3D(0, 0)).toEqual([0, 0, 0]);
  });

  it("gère les coordonnées négatives", () => {
    expect(planVers3D(-5, -3, 2)).toEqual([-5, 2, 3]);
  });
});

describe("pointsPlanVersShape", () => {
  it("convertit un tableau de points plan en points shape", () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5],
    ];
    const result = pointsPlanVersShape(points);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it("gère un tableau vide", () => {
    expect(pointsPlanVersShape([])).toEqual([]);
  });
});
