import "server-only";

import { bboxGeometrie3857, type BBox3857 } from "./projection";

const WMS_URL = "https://data.geopf.fr/wms-r";
const TAILLE = 1024;
const MARGE = 0.2;

/**
 * Récupère une image aérienne via le WMS de la Géoplateforme en EPSG:3857.
 * Pixels carrés au sol garantis grâce à la projection Mercator.
 */
export async function recupererImageWms(
  bbox: BBox3857,
  couche: string = "ORTHOIMAGERY.ORTHOPHOTOS",
): Promise<Buffer> {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: couche,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: `${bbox.xMin},${bbox.yMin},${bbox.xMax},${bbox.yMax}`,
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

/** Génère l'image aérienne d'une parcelle (couche standard). */
export async function genererImageAerienne(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
): Promise<Buffer> {
  const bbox = bboxGeometrie3857(geometry, MARGE);
  return recupererImageWms(bbox);
}

/** Génère l'image infrarouge d'une parcelle. */
export async function genererImageInfrarouge(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
): Promise<Buffer> {
  const bbox = bboxGeometrie3857(geometry, MARGE);
  return recupererImageWms(bbox, "ORTHOIMAGERY.ORTHOPHOTOS.IRC");
}

export { TAILLE as TAILLE_IMAGE, MARGE as MARGE_IMAGE };
