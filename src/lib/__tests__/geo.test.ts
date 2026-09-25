import { describe, it, expect } from "vitest";
import { haversine, estDansZone } from "../geo";

describe("haversine", () => {
  it("renvoie 0 pour deux points identiques", () => {
    expect(haversine({ lat: 48.78, lon: 2.27 }, { lat: 48.78, lon: 2.27 })).toBe(0);
  });

  it("calcule une distance connue (Paris centre → Robinson ≈ 8 km)", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const robinson = { lat: 48.7793, lon: 2.2735 };
    const d = haversine(paris, robinson);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(12);
  });

  it("calcule une distance connue (Versailles → Robinson ≈ 13 km)", () => {
    const versailles = { lat: 48.8014, lon: 2.1301 };
    const robinson = { lat: 48.7793, lon: 2.2735 };
    const d = haversine(versailles, robinson);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(15);
  });
});

describe("estDansZone", () => {
  it("accepte Le Plessis-Robinson", () => {
    expect(estDansZone(48.7811, 2.2629)).toBe(true);
  });

  it("accepte Antony (proche)", () => {
    expect(estDansZone(48.7539, 2.2975)).toBe(true);
  });

  it("refuse Versailles (hors zone)", () => {
    expect(estDansZone(48.8014, 2.1301)).toBe(false);
  });

  it("refuse un point très éloigné", () => {
    expect(estDansZone(45.0, 3.0)).toBe(false);
  });
});
