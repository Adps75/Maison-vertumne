import { describe, it, expect } from "vitest";
import { calculerDirection } from "../direction";

const centre = { lat: 48.78, lon: 2.27 };

// Compensation du facteur cos(lat) pour les diagonales
const cosLat = Math.cos((48.78 * Math.PI) / 180);
const dLat = 0.02;
const dLon = dLat / cosLat; // même distance en mètres → bearing ~45°

describe("calculerDirection", () => {
  it("nord → ~0°", () => {
    const d = calculerDirection(centre, { lat: 48.80, lon: 2.27 });
    expect(d === 0 || d >= 355).toBe(true);
  });

  it("est → ~90°", () => {
    const d = calculerDirection(centre, { lat: 48.78, lon: 2.29 });
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(95);
  });

  it("sud → ~180°", () => {
    const d = calculerDirection(centre, { lat: 48.76, lon: 2.27 });
    expect(d).toBeGreaterThan(175);
    expect(d).toBeLessThan(185);
  });

  it("ouest → ~270°", () => {
    const d = calculerDirection(centre, { lat: 48.78, lon: 2.25 });
    expect(d).toBeGreaterThan(265);
    expect(d).toBeLessThan(275);
  });

  it("nord-est → ~45°", () => {
    const d = calculerDirection(centre, {
      lat: centre.lat + dLat,
      lon: centre.lon + dLon,
    });
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(50);
  });

  it("sud-est → ~135°", () => {
    const d = calculerDirection(centre, {
      lat: centre.lat - dLat,
      lon: centre.lon + dLon,
    });
    expect(d).toBeGreaterThan(130);
    expect(d).toBeLessThan(140);
  });

  it("sud-ouest → ~225°", () => {
    const d = calculerDirection(centre, {
      lat: centre.lat - dLat,
      lon: centre.lon - dLon,
    });
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(230);
  });

  it("nord-ouest → ~315°", () => {
    const d = calculerDirection(centre, {
      lat: centre.lat + dLat,
      lon: centre.lon - dLon,
    });
    expect(d).toBeGreaterThan(310);
    expect(d).toBeLessThan(320);
  });
});
