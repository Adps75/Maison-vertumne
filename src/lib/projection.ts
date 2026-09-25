/**
 * Conversion entre coordonnées géographiques (lat/lon WGS84) et EPSG:3857 (Web Mercator).
 * Utilisé pour générer des images aériennes avec des pixels carrés au sol
 * et convertir des coordonnées en pixels sur ces images.
 */

const R = 6378137; // Rayon terrestre en mètres (WGS84)

export interface Point3857 {
  x: number;
  y: number;
}

export interface BBox3857 {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** Convertit lat/lon en EPSG:3857 (mètres). */
export function versEpsg3857(lat: number, lon: number): Point3857 {
  const x = R * (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}

/** Convertit EPSG:3857 en lat/lon. */
export function depuisEpsg3857(x: number, y: number): { lat: number; lon: number } {
  const lon = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lon };
}

/** Calcule le BBOX 3857 d'une géométrie GeoJSON avec marge, rendu carré. */
export function bboxGeometrie3857(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
  marge: number,
): BBox3857 {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  const rings =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat(1)
      : geometry.coordinates;

  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      const p = versEpsg3857(lat, lon);
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }

  const dx = xMax - xMin;
  const dy = yMax - yMin;
  const mx = dx * marge;
  const my = dy * marge;

  xMin -= mx;
  xMax += mx;
  yMin -= my;
  yMax += my;

  // Rendre carré
  const w = xMax - xMin;
  const h = yMax - yMin;
  if (w > h) {
    const diff = (w - h) / 2;
    yMin -= diff;
    yMax += diff;
  } else {
    const diff = (h - w) / 2;
    xMin -= diff;
    xMax += diff;
  }

  return { xMin, yMin, xMax, yMax };
}

/** Convertit lat/lon en coordonnées pixel sur une image générée à partir d'un BBOX 3857. */
export function versPixel(
  lat: number,
  lon: number,
  bbox: BBox3857,
  taille: number,
): { px: number; py: number } {
  const p = versEpsg3857(lat, lon);
  const px = ((p.x - bbox.xMin) / (bbox.xMax - bbox.xMin)) * taille;
  // Y inversé : le haut de l'image est yMax
  const py = ((bbox.yMax - p.y) / (bbox.yMax - bbox.yMin)) * taille;
  return { px, py };
}
