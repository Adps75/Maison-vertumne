import "server-only";

const WMS_URL = "https://data.geopf.fr/wms-r";
const TAILLE = 1024;
const MARGE = 0.2;

interface BBox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

/** Calcule le bounding box d'une géométrie GeoJSON (MultiPolygon ou Polygon). */
function bboxDepuisGeometrie(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
): BBox {
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;

  const rings =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat(1)
      : geometry.coordinates;

  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
    }
  }

  return { latMin, lonMin, latMax, lonMax };
}

/** Ajoute une marge au bounding box et le rend carré. */
function elargirBbox(bbox: BBox): BBox {
  const dLat = bbox.latMax - bbox.latMin;
  const dLon = bbox.lonMax - bbox.lonMin;
  const margeLat = dLat * MARGE;
  const margeLon = dLon * MARGE;

  let latMin = bbox.latMin - margeLat;
  let latMax = bbox.latMax + margeLat;
  let lonMin = bbox.lonMin - margeLon;
  let lonMax = bbox.lonMax + margeLon;

  // Rendre le bbox carré (en degrés) pour éviter la déformation
  const hauteur = latMax - latMin;
  const largeur = lonMax - lonMin;
  if (hauteur > largeur) {
    const diff = (hauteur - largeur) / 2;
    lonMin -= diff;
    lonMax += diff;
  } else {
    const diff = (largeur - hauteur) / 2;
    latMin -= diff;
    latMax += diff;
  }

  return { latMin, lonMin, latMax, lonMax };
}

/** Génère l'image aérienne d'une parcelle via le WMS de la Géoplateforme. */
export async function genererImageAerienne(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
): Promise<Buffer> {
  const bbox = elargirBbox(bboxDepuisGeometrie(geometry));

  // WMS 1.3.0 + EPSG:4326 → BBOX = lat_min,lon_min,lat_max,lon_max
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: "ORTHOIMAGERY.ORTHOPHOTOS",
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: `${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`,
    WIDTH: String(TAILLE),
    HEIGHT: String(TAILLE),
    FORMAT: "image/jpeg",
  });

  const res = await fetch(`${WMS_URL}?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`WMS erreur ${res.status}: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
