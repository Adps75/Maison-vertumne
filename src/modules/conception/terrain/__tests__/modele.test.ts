import { describe, it, expect } from "vitest";
import { construireModele } from "../modele";
import type { GrilleRelief, PointCote } from "../types";

function grillePlate(altitude: number, taille = 10): GrilleRelief {
  const n = taille + 1;
  return {
    origine: [0, 0],
    pas: 1,
    colonnes: n,
    lignes: n,
    altitudes: new Array(n * n).fill(altitude),
  };
}

function grilleInclinee(taille = 10): GrilleRelief {
  // z = 100 + 0.5*x (pente est-ouest)
  const n = taille + 1;
  const altitudes: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      altitudes.push(100 + 0.5 * x);
    }
  }
  return { origine: [0, 0], pas: 1, colonnes: n, lignes: n, altitudes };
}

describe("construireModele", () => {
  it("sans rien → terrain plat à 0", () => {
    const alt = construireModele(null, [], null);
    expect(alt(5, 5)).toBe(0);
    expect(alt(0, 0)).toBe(0);
  });

  it("grille plate, pas de point coté → altitude relative 0 partout", () => {
    // altRef = 100, grille à 100 → tout est à 0 relatif
    const alt = construireModele(grillePlate(100), [], 100);
    expect(alt(5, 5)).toBeCloseTo(0);
    expect(alt(3, 7)).toBeCloseTo(0);
  });

  it("plan incliné sans point coté → pente IGN retranscrite", () => {
    // altRef = 100, grille inclinée z = 100 + 0.5*x
    // altitude relative = (100 + 0.5*x) - 100 = 0.5*x
    const alt = construireModele(grilleInclinee(), [], 100);
    expect(alt(0, 5)).toBeCloseTo(0);
    expect(alt(4, 5)).toBeCloseTo(2);
    expect(alt(8, 5)).toBeCloseTo(4);
  });

  it("un seul point coté → le terrain passe exactement par le point", () => {
    // Grille plate à 100, altRef = 100
    // Point coté à (5, 5) avec altitude relative +0.80
    const pc: PointCote[] = [{ x: 5, y: 5, altitudeRelative: 0.80 }];
    const alt = construireModele(grillePlate(100), pc, 100);
    expect(alt(5, 5)).toBeCloseTo(0.80, 2);
  });

  it("deux points cotés qui contredisent l'IGN → terrain passe par les deux", () => {
    // Grille plate à 100, altRef = 100
    // Point A à (3, 5) : +0.80, Point B à (7, 5) : -0.40
    const pc: PointCote[] = [
      { x: 3, y: 5, altitudeRelative: 0.80 },
      { x: 7, y: 5, altitudeRelative: -0.40 },
    ];
    const alt = construireModele(grillePlate(100), pc, 100);
    expect(alt(3, 5)).toBeCloseTo(0.80, 2);
    expect(alt(7, 5)).toBeCloseTo(-0.40, 2);
  });

  it("trois points cotés → interpolation barycentrique exacte", () => {
    // Grille plate à 50, altRef = 50
    const pc: PointCote[] = [
      { x: 0, y: 0, altitudeRelative: 1.0 },
      { x: 8, y: 0, altitudeRelative: 0.0 },
      { x: 4, y: 8, altitudeRelative: 0.5 },
    ];
    const alt = construireModele(grillePlate(50), pc, 50);
    // Chaque point est exact
    expect(alt(0, 0)).toBeCloseTo(1.0, 2);
    expect(alt(8, 0)).toBeCloseTo(0.0, 2);
    expect(alt(4, 8)).toBeCloseTo(0.5, 2);
    // Centre du triangle ≈ moyenne
    expect(alt(4, 2.67)).toBeCloseTo(0.5, 1);
  });

  it("point hors enveloppe → retour progressif à l'IGN (fondu sur 5 m)", () => {
    // Grille plate à 100, altRef = 100 → base = 0
    // Un point coté à (5, 5) : +1.0
    const pc: PointCote[] = [{ x: 5, y: 5, altitudeRelative: 1.0 }];
    const alt = construireModele(grillePlate(100), pc, 100, 5);

    // Au point même
    expect(alt(5, 5)).toBeCloseTo(1.0, 2);
    // À 2.5 m → moitié de l'écart
    expect(alt(5, 2.5, )).toBeCloseTo(0.5, 1);
    // À 5 m → écart = 0
    expect(alt(5, 0)).toBeCloseTo(0, 1);
    // Au-delà de 5 m → écart = 0 (altitude IGN seule)
    expect(alt(5, -2)).toBeCloseTo(0, 1);
  });

  it("sans grille IGN → terrain construit uniquement à partir des points cotés", () => {
    const pc: PointCote[] = [
      { x: 2, y: 2, altitudeRelative: 0.50 },
      { x: 8, y: 2, altitudeRelative: -0.20 },
    ];
    const alt = construireModele(null, pc, null);
    // Chaque point est exact
    expect(alt(2, 2)).toBeCloseTo(0.50, 2);
    expect(alt(8, 2)).toBeCloseTo(-0.20, 2);
  });

  it("sans grille IGN, un seul point coté → altitude au point, fondu autour", () => {
    const pc: PointCote[] = [{ x: 5, y: 5, altitudeRelative: 0.30 }];
    const alt = construireModele(null, pc, null, 5);
    expect(alt(5, 5)).toBeCloseTo(0.30, 2);
    expect(alt(5, 0)).toBeCloseTo(0, 1); // à 5 m → 0
  });
});
