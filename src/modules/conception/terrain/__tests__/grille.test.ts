import { describe, it, expect } from "vitest";
import { altitudeIGN } from "../grille";
import type { GrilleRelief } from "../types";

function grillePlate(altitude: number): GrilleRelief {
  // Grille 5×5 au pas de 1 m, toutes les altitudes identiques
  return {
    origine: [0, 0],
    pas: 1,
    colonnes: 5,
    lignes: 5,
    altitudes: new Array(25).fill(altitude),
  };
}

function grilleInclinee(): GrilleRelief {
  // Plan incliné : z = 100 + 0.5*x + 0.3*y
  const colonnes = 6;
  const lignes = 6;
  const altitudes: number[] = [];
  for (let y = 0; y < lignes; y++) {
    for (let x = 0; x < colonnes; x++) {
      altitudes.push(100 + 0.5 * x + 0.3 * y);
    }
  }
  return { origine: [0, 0], pas: 1, colonnes, lignes, altitudes };
}

describe("altitudeIGN", () => {
  it("grille plate → retourne l'altitude constante", () => {
    const g = grillePlate(85.5);
    expect(altitudeIGN(2, 2, g)).toBeCloseTo(85.5);
    expect(altitudeIGN(0, 0, g)).toBeCloseTo(85.5);
    expect(altitudeIGN(3.5, 1.5, g)).toBeCloseTo(85.5);
  });

  it("plan incliné → interpolation bilinéaire exacte", () => {
    const g = grilleInclinee();
    // Point sur un noeud
    expect(altitudeIGN(2, 3, g)).toBeCloseTo(100 + 0.5 * 2 + 0.3 * 3);
    // Point interpolé
    expect(altitudeIGN(1.5, 2.5, g)).toBeCloseTo(100 + 0.5 * 1.5 + 0.3 * 2.5);
    // Coin (0, 0)
    expect(altitudeIGN(0, 0, g)).toBeCloseTo(100);
  });

  it("point hors grille → null", () => {
    const g = grillePlate(85);
    expect(altitudeIGN(-1, 2, g)).toBeNull();
    expect(altitudeIGN(2, -1, g)).toBeNull();
    expect(altitudeIGN(5, 2, g)).toBeNull();
    expect(altitudeIGN(2, 5, g)).toBeNull();
  });

  it("point sur le bord droit/haut exact → valeur valide", () => {
    const g = grillePlate(90);
    expect(altitudeIGN(4, 2, g)).toBeCloseTo(90);
    expect(altitudeIGN(2, 4, g)).toBeCloseTo(90);
  });

  it("grille avec origine décalée", () => {
    const g: GrilleRelief = {
      origine: [10, 20],
      pas: 2,
      colonnes: 3,
      lignes: 3,
      altitudes: [
        50, 52, 54,
        51, 53, 55,
        52, 54, 56,
      ],
    };
    // (10, 20) → coin [0,0] = 50
    expect(altitudeIGN(10, 20, g)).toBeCloseTo(50);
    // (12, 22) → coin [1,1] = 53
    expect(altitudeIGN(12, 22, g)).toBeCloseTo(53);
    // Interpolation entre les quatre coins autour de (11, 21)
    expect(altitudeIGN(11, 21, g)).toBeCloseTo((50 + 52 + 51 + 53) / 4);
  });
});
