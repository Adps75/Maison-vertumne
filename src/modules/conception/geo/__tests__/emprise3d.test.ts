import { describe, it, expect } from "vitest";
import { emprise3D, type Batiment3D } from "../emprise3d";
import type { Pt } from "../plan";

// Zone rectangle simple : 0,0 → 20,20
const zoneRect: Pt[] = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];

function batiment(x: number, y: number, taille = 5, hauteur: number | null = 8): Batiment3D {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [[[x, y], [x + taille, y], [x + taille, y + taille], [x, y + taille], [x, y]]],
    },
    hauteur,
    cleabs: `bat-${x}-${y}`,
  };
}

describe("emprise3D", () => {
  it("calcule l'emprise avec marge de 10 m par défaut", () => {
    const result = emprise3D(zoneRect, []);
    expect(result.emprise).toEqual([-10, -10, 30, 30]);
  });

  it("calcule l'emprise avec marge personnalisée", () => {
    const result = emprise3D(zoneRect, [], 5);
    expect(result.emprise).toEqual([-5, -5, 25, 25]);
  });

  it("inclut un bâtiment dans la zone", () => {
    const bat = batiment(5, 5);
    const result = emprise3D(zoneRect, [bat]);
    expect(result.batiments).toHaveLength(1);
    expect(result.batiments[0].cleabs).toBe("bat-5-5");
  });

  it("inclut un bâtiment hors zone mais à moins de 15 m", () => {
    // Bâtiment à 12 m de la zone (coin le plus proche à 25,0 → dist au coin 20,0 = 5)
    const bat = batiment(25, 0);
    const result = emprise3D(zoneRect, [bat]);
    expect(result.batiments).toHaveLength(1);
  });

  it("exclut un bâtiment hors zone à plus de 15 m", () => {
    // Bâtiment très loin
    const bat = batiment(100, 100);
    const result = emprise3D(zoneRect, [bat]);
    expect(result.batiments).toHaveLength(0);
  });

  it("inclut un bâtiment dans l'emprise élargie même s'il est loin de la zone", () => {
    // Bâtiment à (-8, -8) : dans l'emprise [-10,-10,30,30] mais à ~11m du coin (0,0)
    const bat = batiment(-8, -8, 3);
    const result = emprise3D(zoneRect, [bat]);
    expect(result.batiments).toHaveLength(1);
  });

  it("gère les MultiPolygon", () => {
    const bat: Batiment3D = {
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[5, 5], [10, 5], [10, 10], [5, 10], [5, 5]]]],
      },
      hauteur: 6,
      cleabs: "multi-bat",
    };
    const result = emprise3D(zoneRect, [bat]);
    expect(result.batiments).toHaveLength(1);
  });

  it("renvoie un résultat vide pour une zone invalide", () => {
    const result = emprise3D([[0, 0], [1, 1]], []);
    expect(result.emprise).toEqual([0, 0, 0, 0]);
    expect(result.batiments).toHaveLength(0);
  });
});
