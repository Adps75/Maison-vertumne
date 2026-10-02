import { describe, it, expect } from "vitest";
import {
  surface,
  perimetre,
  longueur,
  dist,
  milieu,
  angleEntrePoints,
  projectionSurSegment,
  intersectionSegments,
  pointDansPolygone,
  decalagePolyligne,
  surfaceCercle,
  longueurArc,
  cercleVersPolygone,
  type Pt,
} from "../plan";

describe("surface", () => {
  it("rectangle 10 × 4 = 40 m²", () => {
    const rect: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
    expect(surface(rect)).toBe(40);
  });

  it("triangle 3-4-5", () => {
    const tri: Pt[] = [[0, 0], [3, 0], [0, 4]];
    expect(surface(tri)).toBe(6);
  });

  it("polygone concave (L)", () => {
    // Forme en L : 10×10 avec un coin 5×5 retiré
    const L: Pt[] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
    expect(surface(L)).toBe(75); // 100 - 25
  });

  it("cercle de rayon 2 → proche de 12.57 m²", () => {
    const pts = cercleVersPolygone(0, 0, 2, 256);
    expect(surface(pts)).toBeCloseTo(surfaceCercle(2), 1);
  });
});

describe("surfaceCercle", () => {
  it("rayon 2 → π × 4 ≈ 12.566", () => {
    expect(surfaceCercle(2)).toBeCloseTo(12.566, 2);
  });
});

describe("perimetre et longueur", () => {
  it("périmètre carré 5 × 5 = 20 m", () => {
    const carre: Pt[] = [[0, 0], [5, 0], [5, 5], [0, 5]];
    expect(perimetre(carre)).toBe(20);
  });

  it("longueur polyligne 3-4-5", () => {
    const pts: Pt[] = [[0, 0], [3, 0], [3, 4]];
    expect(longueur(pts)).toBe(7);
  });
});

describe("longueurArc", () => {
  it("demi-cercle de rayon 1 → π ≈ 3.14", () => {
    expect(longueurArc(1, 0, 180)).toBeCloseTo(Math.PI, 2);
  });

  it("cercle complet de rayon 2 → 4π ≈ 12.57", () => {
    expect(longueurArc(2, 0, 360)).toBeCloseTo(2 * Math.PI * 2, 2);
  });

  it("quart de cercle rayon 3 → 3π/2 ≈ 4.71", () => {
    expect(longueurArc(3, 0, 90)).toBeCloseTo((3 * Math.PI) / 2, 2);
  });
});

describe("dist et milieu", () => {
  it("distance 3-4-5", () => {
    expect(dist([0, 0], [3, 4])).toBe(5);
  });

  it("milieu", () => {
    expect(milieu([2, 6], [8, 10])).toEqual([5, 8]);
  });
});

describe("angleEntrePoints", () => {
  it("est = 0°", () => {
    expect(angleEntrePoints([0, 0], [1, 0])).toBeCloseTo(0);
  });

  it("nord = 90°", () => {
    expect(angleEntrePoints([0, 0], [0, 1])).toBeCloseTo(90);
  });
});

describe("projectionSurSegment", () => {
  it("projection orthogonale sur un segment horizontal", () => {
    const r = projectionSurSegment([5, 3], [0, 0], [10, 0]);
    expect(r.projection).toEqual([5, 0]);
    expect(r.t).toBeCloseTo(0.5);
    expect(r.distance).toBe(3);
  });

  it("projection hors segment → clampée à l'extrémité", () => {
    const r = projectionSurSegment([15, 0], [0, 0], [10, 0]);
    expect(r.projection).toEqual([10, 0]);
    expect(r.t).toBe(1);
  });
});

describe("intersectionSegments", () => {
  it("intersection en croix", () => {
    const r = intersectionSegments([0, 0], [10, 10], [0, 10], [10, 0]);
    expect(r).not.toBeNull();
    expect(r![0]).toBeCloseTo(5);
    expect(r![1]).toBeCloseTo(5);
  });

  it("segments parallèles → null", () => {
    expect(intersectionSegments([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
  });

  it("segments qui ne se croisent pas → null", () => {
    expect(intersectionSegments([0, 0], [5, 0], [6, 1], [10, 1])).toBeNull();
  });
});

describe("pointDansPolygone", () => {
  const carre: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("point intérieur", () => {
    expect(pointDansPolygone([5, 5], carre)).toBe(true);
  });

  it("point extérieur", () => {
    expect(pointDansPolygone([15, 5], carre)).toBe(false);
  });
});

describe("decalagePolyligne", () => {
  it("décale une ligne horizontale vers le haut", () => {
    const pts: Pt[] = [[0, 0], [10, 0]];
    const result = decalagePolyligne(pts, 1);
    expect(result[0][1]).toBeCloseTo(1);
    expect(result[1][1]).toBeCloseTo(1);
    expect(result[0][0]).toBeCloseTo(0);
    expect(result[1][0]).toBeCloseTo(10);
  });
});
