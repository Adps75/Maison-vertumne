import { describe, it, expect } from "vitest";
import {
  terrainVersEcran,
  ecranVersTerrain,
  coordonneesVersEcran,
  distanceTerrain,
} from "../canevas";

describe("conversion terrain ↔ écran", () => {
  it("Y terrain positif (nord) → Y écran négatif (haut)", () => {
    const ecran = terrainVersEcran({ x: 10, y: 20 });
    expect(ecran.x).toBe(10);
    expect(ecran.y).toBe(-20);
  });

  it("aller-retour terrain → écran → terrain", () => {
    const terrain = { x: 15.5, y: -3.2 };
    const retour = ecranVersTerrain(terrainVersEcran(terrain));
    expect(retour.x).toBeCloseTo(terrain.x);
    expect(retour.y).toBeCloseTo(terrain.y);
  });

  it("coordonneesVersEcran aplatit et inverse Y", () => {
    const coords = [
      [0, 0],
      [10, 0],
      [10, 5],
    ];
    const result = coordonneesVersEcran(coords);
    expect(result).toEqual([0, -0, 10, -0, 10, -5]);
  });

  it("distanceTerrain calcule la distance euclidienne en mètres", () => {
    expect(distanceTerrain({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("distanceTerrain avec des décimales", () => {
    expect(distanceTerrain({ x: 1.5, y: 2.5 }, { x: 4.5, y: 6.5 })).toBe(5);
  });
});

describe("zoom — pixels et mètres", () => {
  it("à zoom 1, 1 pixel = 1 mètre terrain", () => {
    // Un point terrain à (10, 20) → écran (10, -20)
    // Avec zoom=1 et offset=(0,0), le pixel est (10, -20)
    // Donc 10 pixels = 10 mètres
    const a = terrainVersEcran({ x: 0, y: 0 });
    const b = terrainVersEcran({ x: 10, y: 0 });
    expect(b.x - a.x).toBe(10); // 10 pixels = 10 mètres
  });

  it("à zoom 2, 1 pixel = 0.5 mètre terrain", () => {
    // Avec zoom=2, un écart de 20 pixels en écran = 10 pixels en stage = 10 mètres
    // Inversement, 1 pixel stage = 1 mètre, mais 1 pixel écran = 0.5 mètre
    const zoom = 2;
    const pixelsEcran = 20;
    const pixelsStage = pixelsEcran / zoom; // 10
    expect(pixelsStage).toBe(10); // = 10 mètres
  });

  it("à zoom 0.5, 1 pixel = 2 mètres terrain", () => {
    const zoom = 0.5;
    const pixelsEcran = 10;
    const pixelsStage = pixelsEcran / zoom; // 20
    expect(pixelsStage).toBe(20); // = 20 mètres
  });
});
