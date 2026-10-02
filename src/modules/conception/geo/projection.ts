import proj4 from "proj4";

// Définition Lambert 93 (EPSG:2154)
proj4.defs(
  "EPSG:2154",
  "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export interface PointL93 {
  x: number;
  y: number;
}

export interface PointWGS84 {
  lon: number;
  lat: number;
}

export interface OrigineLocale {
  x: number; // Lambert 93 absolu, arrondi au mètre
  y: number;
}

/** Convertit WGS84 (lon, lat) en Lambert 93 (x, y) en mètres. */
export function wgs84VersL93(lon: number, lat: number): PointL93 {
  const [x, y] = proj4("EPSG:4326", "EPSG:2154", [lon, lat]);
  return { x, y };
}

/** Convertit Lambert 93 (x, y) en WGS84 (lon, lat). */
export function l93VersWgs84(x: number, y: number): PointWGS84 {
  const [lon, lat] = proj4("EPSG:2154", "EPSG:4326", [x, y]);
  return { lon, lat };
}

/** Convertit une géométrie GeoJSON WGS84 en Lambert 93 absolu. */
export function geometrieWgs84VersL93(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        ring.map(([lon, lat]) => {
          const p = wgs84VersL93(lon, lat);
          return [p.x, p.y];
        }),
      ),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([lon, lat]) => {
          const p = wgs84VersL93(lon, lat);
          return [p.x, p.y];
        }),
      ),
    ),
  };
}

/** Calcule l'origine locale (coin sud-ouest, arrondi au mètre) d'une géométrie L93. */
export function calculerOrigine(
  geometrieL93: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): OrigineLocale {
  let xMin = Infinity;
  let yMin = Infinity;

  const rings =
    geometrieL93.type === "MultiPolygon"
      ? geometrieL93.coordinates.flat(1)
      : geometrieL93.coordinates;

  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
    }
  }

  return { x: Math.floor(xMin), y: Math.floor(yMin) };
}

/** Convertit une géométrie L93 absolue en coordonnées relatives à l'origine. */
export function versRelatif(
  geometrieL93: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  origine: OrigineLocale,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const convertir = (coords: number[][]) =>
    coords.map(([x, y, ...rest]) => [x - origine.x, y - origine.y, ...rest]);

  if (geometrieL93.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometrieL93.coordinates.map(convertir),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometrieL93.coordinates.map((polygon) =>
      polygon.map(convertir),
    ),
  };
}

/** Convertit des coordonnées relatives en L93 absolu. */
export function versAbsolu(x: number, y: number, origine: OrigineLocale): PointL93 {
  return { x: x + origine.x, y: y + origine.y };
}
