import { describe, it, expect } from "vitest";
import {
  wgs84VersL93,
  l93VersWgs84,
  calculerOrigine,
  versRelatif,
} from "../projection";

describe("projection Lambert 93", () => {
  it("aller-retour WGS84 → L93 → WGS84 au Plessis-Robinson (écart < 1 cm)", () => {
    const lon = 2.2629;
    const lat = 48.7811;
    const l93 = wgs84VersL93(lon, lat);
    const retour = l93VersWgs84(l93.x, l93.y);
    expect(Math.abs(retour.lon - lon)).toBeLessThan(0.0000001); // ~1 cm
    expect(Math.abs(retour.lat - lat)).toBeLessThan(0.0000001);
  });

  it("aller-retour à Sceaux", () => {
    const lon = 2.2925;
    const lat = 48.7784;
    const l93 = wgs84VersL93(lon, lat);
    const retour = l93VersWgs84(l93.x, l93.y);
    expect(Math.abs(retour.lon - lon)).toBeLessThan(0.0000001);
    expect(Math.abs(retour.lat - lat)).toBeLessThan(0.0000001);
  });

  it("aller-retour à Antony", () => {
    const lon = 2.2975;
    const lat = 48.7539;
    const l93 = wgs84VersL93(lon, lat);
    const retour = l93VersWgs84(l93.x, l93.y);
    expect(Math.abs(retour.lon - lon)).toBeLessThan(0.0000001);
    expect(Math.abs(retour.lat - lat)).toBeLessThan(0.0000001);
  });

  // Point de référence officiel — valeurs à compléter avec le convertisseur IGN
  it.todo("point officiel IGN (valeurs à compléter)", () => {
    // Remplacer par les coordonnées vérifiées avec https://geodesie.ign.fr/
    // const lon = TODO;
    // const lat = TODO;
    // const xAttendu = TODO;
    // const yAttendu = TODO;
    // const l93 = wgs84VersL93(lon, lat);
    // expect(l93.x).toBeCloseTo(xAttendu, 2); // 1 cm
    // expect(l93.y).toBeCloseTo(yAttendu, 2);
  });

  it("Le Plessis-Robinson donne des coordonnées L93 cohérentes", () => {
    const l93 = wgs84VersL93(2.2629, 48.7811);
    // proj4 vérifié : x ≈ 645839, y ≈ 6853698
    expect(l93.x).toBeGreaterThan(645000);
    expect(l93.x).toBeLessThan(647000);
    expect(l93.y).toBeGreaterThan(6853000);
    expect(l93.y).toBeLessThan(6855000);
  });
});

describe("origine locale et coordonnées relatives", () => {
  it("calculerOrigine renvoie le coin sud-ouest arrondi au mètre", () => {
    const geom: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [647810.5, 6855820.3],
          [647850.7, 6855820.3],
          [647850.7, 6855860.9],
          [647810.5, 6855860.9],
          [647810.5, 6855820.3],
        ],
      ],
    };
    const o = calculerOrigine(geom);
    expect(o.x).toBe(647810);
    expect(o.y).toBe(6855820);
  });

  it("versRelatif soustrait l'origine", () => {
    const geom: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [647820, 6855830],
          [647840, 6855830],
          [647840, 6855850],
          [647820, 6855850],
          [647820, 6855830],
        ],
      ],
    };
    const origine = { x: 647800, y: 6855800 };
    const relatif = versRelatif(geom, origine) as GeoJSON.Polygon;

    expect(relatif.coordinates[0][0][0]).toBe(20);
    expect(relatif.coordinates[0][0][1]).toBe(30);
  });
});
