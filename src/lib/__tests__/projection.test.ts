import { describe, it, expect } from "vitest";
import { versEpsg3857, versPixel, bboxGeometrie3857 } from "../projection";

describe("projection", () => {
  it("un point au centre de la BBOX tombe au centre de l'image", () => {
    const centre = { lat: 48.78, lon: 2.27 };
    const c3857 = versEpsg3857(centre.lat, centre.lon);

    // BBOX carré de 200m autour du centre
    const demi = 100; // mètres
    const bbox = {
      xMin: c3857.x - demi,
      xMax: c3857.x + demi,
      yMin: c3857.y - demi,
      yMax: c3857.y + demi,
    };

    const { px, py } = versPixel(centre.lat, centre.lon, bbox, 1024);
    expect(px).toBeCloseTo(512, 0);
    expect(py).toBeCloseTo(512, 0);
  });

  it("10 m font le même nombre de pixels horizontal et vertical", () => {
    const centre = { lat: 48.78, lon: 2.27 };
    const c3857 = versEpsg3857(centre.lat, centre.lon);

    const demi = 100;
    const bbox = {
      xMin: c3857.x - demi,
      xMax: c3857.x + demi,
      yMin: c3857.y - demi,
      yMax: c3857.y + demi,
    };

    const taille = 1024;

    // Point décalé de 10m en X (est)
    const pEst = versPixel(
      centre.lat,
      centre.lon + 10 / (111320 * Math.cos((centre.lat * Math.PI) / 180)),
      bbox,
      taille,
    );

    // Point décalé de 10m en Y (nord)
    const pNord = versPixel(
      centre.lat + 10 / 111320,
      centre.lon,
      bbox,
      taille,
    );

    const centreP = versPixel(centre.lat, centre.lon, bbox, taille);
    const dxPx = Math.abs(pEst.px - centreP.px);
    const dyPx = Math.abs(pNord.py - centreP.py);

    // En Mercator, les pixels doivent être carrés
    expect(dxPx).toBeCloseTo(dyPx, 0);
    expect(dxPx).toBeGreaterThan(30); // 10m sur 200m * 1024 ≈ 51 px
  });

  it("bboxGeometrie3857 produit un carré", () => {
    const geom: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [2.26, 48.78],
          [2.27, 48.78],
          [2.27, 48.79],
          [2.26, 48.79],
          [2.26, 48.78],
        ],
      ],
    };

    const bbox = bboxGeometrie3857(geom, 0.2);
    const w = bbox.xMax - bbox.xMin;
    const h = bbox.yMax - bbox.yMin;
    expect(w).toBeCloseTo(h, 0);
  });
});
