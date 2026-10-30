import { describe, it, expect } from "vitest";
import { vfovFromFocal35mm, normaliserCap } from "../fov";

/**
 * Valeurs de référence calculées à la main :
 * - Diagonale format 24×36 = sqrt(24² + 36²) = 43,2666 mm
 * - dfov = 2 * atan(43.2666 / (2 * focale))
 * - tan(vfov/2) = tan(dfov/2) / sqrt(aspect² + 1)
 * - vfov = 2 * atan(tan(vfov/2))
 */

describe("vfovFromFocal35mm", () => {
  it("26 mm en 4:3 paysage", () => {
    // aspect = 4/3 ≈ 1.333
    // dfov = 2 * atan(43.2666 / 52) ≈ 79.49°
    // tan(vfov/2) = tan(39.75°) / sqrt(1.333² + 1) = 0.8317 / 1.6667 = 0.4990
    // vfov = 2 * atan(0.4990) ≈ 53.13°
    const vfov = vfovFromFocal35mm(26, 4 / 3);
    expect(vfov).toBeCloseTo(53.13, 0);
  });

  it("26 mm en 4:3 portrait", () => {
    // aspect = 3/4 = 0.75
    // tan(vfov/2) = tan(39.75°) / sqrt(0.75² + 1) = 0.8317 / 1.25 = 0.6654
    // vfov = 2 * atan(0.6654) ≈ 67.28°
    const vfov = vfovFromFocal35mm(26, 3 / 4);
    expect(vfov).toBeCloseTo(67.28, 0);
  });

  it("50 mm en 3:2 paysage", () => {
    // aspect = 3/2 = 1.5
    // dfov = 2 * atan(43.2666 / 100) ≈ 46.79°
    // tan(vfov/2) = tan(23.40°) / sqrt(1.5² + 1) = 0.4327 / 1.8028 = 0.2400
    // vfov = 2 * atan(0.2400) ≈ 27.0°
    const vfov = vfovFromFocal35mm(50, 3 / 2);
    expect(vfov).toBeCloseTo(27.0, 0);
  });

  it("85 mm en 3:2 paysage → champ étroit", () => {
    const vfov = vfovFromFocal35mm(85, 3 / 2);
    expect(vfov).toBeGreaterThan(10);
    expect(vfov).toBeLessThan(20);
  });

  it("le portrait a un champ vertical plus large que le paysage", () => {
    const paysage = vfovFromFocal35mm(26, 4 / 3);
    const portrait = vfovFromFocal35mm(26, 3 / 4);
    expect(portrait).toBeGreaterThan(paysage);
  });
});

describe("normaliserCap", () => {
  it("valeur déjà dans [0, 360[", () => {
    expect(normaliserCap(90)).toBe(90);
    expect(normaliserCap(0)).toBe(0);
    expect(normaliserCap(359.9)).toBeCloseTo(359.9);
  });

  it("valeur négative", () => {
    expect(normaliserCap(-90)).toBeCloseTo(270);
    expect(normaliserCap(-180)).toBeCloseTo(180);
    expect(normaliserCap(-360)).toBeCloseTo(0);
    expect(normaliserCap(-1)).toBeCloseTo(359);
  });

  it("valeur > 360", () => {
    expect(normaliserCap(360)).toBeCloseTo(0);
    expect(normaliserCap(450)).toBeCloseTo(90);
    expect(normaliserCap(720)).toBeCloseTo(0);
  });

  it("cap depuis deux points (nord, est, sud, ouest)", () => {
    // Cap = atan2(dx, dy) → convention nord = 0, est = 90
    const cap = (x1: number, y1: number, x2: number, y2: number) =>
      normaliserCap(Math.atan2(x2 - x1, y2 - y1) * 180 / Math.PI);

    // Vers le nord : dy > 0, dx = 0 → cap 0
    expect(cap(0, 0, 0, 1)).toBeCloseTo(0);
    // Vers l'est : dx > 0, dy = 0 → cap 90
    expect(cap(0, 0, 1, 0)).toBeCloseTo(90);
    // Vers le sud : dy < 0, dx = 0 → cap 180
    expect(cap(0, 0, 0, -1)).toBeCloseTo(180);
    // Vers l'ouest : dx < 0, dy = 0 → cap 270
    expect(cap(0, 0, -1, 0)).toBeCloseTo(270);
  });
});
