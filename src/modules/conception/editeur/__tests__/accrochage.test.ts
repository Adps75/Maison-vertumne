import { describe, it, expect } from "vitest";
import { trouverAccrochage, contrainteOrtho } from "../accrochage";
import type { Element } from "../../types";

describe("trouverAccrochage", () => {
  const parcellePoints: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("accroche sur une extrémité de la parcelle", () => {
    const r = trouverAccrochage([0.05, 0.05], [], parcellePoints, [], 10);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("extremite");
    expect(r!.point).toEqual([0, 0]);
  });

  it("accroche sur un milieu de segment", () => {
    const r = trouverAccrochage([5, 0.05], [], parcellePoints, [], 10);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("milieu");
    expect(r!.point[0]).toBeCloseTo(5);
    expect(r!.point[1]).toBeCloseTo(0);
  });

  it("pas d'accrochage si trop loin", () => {
    const r = trouverAccrochage([50, 50], [], parcellePoints, [], 10);
    expect(r).toBeNull();
  });

  it("tolérance dépend du zoom", () => {
    // Au zoom 0.1, la tolérance en mètres est 10/0.1 = 100 m
    const rLoin = trouverAccrochage([50, 50], [], parcellePoints, [], 0.1);
    expect(rLoin).not.toBeNull(); // Devrait trouver un point de la parcelle
  });
});

describe("contrainteOrtho", () => {
  it("direction principalement horizontale → Y contraint", () => {
    const r = contrainteOrtho([0, 0], [8, 3]);
    expect(r).toEqual([8, 0]);
  });

  it("direction principalement verticale → X contraint", () => {
    const r = contrainteOrtho([0, 0], [3, 8]);
    expect(r).toEqual([0, 8]);
  });
});
