import "server-only";

import type { OrigineLocale } from "../geo/projection";

interface BatimentBdTopo {
  geometrie: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  hauteur: number | null;
  cleabs: string;
}

/**
 * Récupère les bâtiments de la BD TOPO dans une emprise L93 + marge.
 * Renvoie les géométries en coordonnées relatives à l'origine.
 */
export async function recupererBatiments(
  empriseL93: { xMin: number; yMin: number; xMax: number; yMax: number },
  marge: number,
  origine: OrigineLocale,
): Promise<
  { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; hauteur: number | null; cleabs: string }[]
> {
  const bbox = [
    empriseL93.xMin - marge,
    empriseL93.yMin - marge,
    empriseL93.xMax + marge,
    empriseL93.yMax + marge,
  ].join(",");

  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAME: "BDTOPO_V3:batiment",
    BBOX: `${bbox},EPSG:2154`,
    SRSNAME: "EPSG:2154",
    OUTPUTFORMAT: "application/json",
    COUNT: "200",
  });

  const res = await fetch(`https://data.geopf.fr/wfs/ows?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`WFS bâtiments erreur ${res.status}`);
  }

  const data = await res.json();
  const features = data.features ?? [];

  return features.map((f: { properties: BatimentBdTopo; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }) => {
    // Convertir en relatif
    const geom = convertirRelatif(f.geometry, origine);
    return {
      geometry: geom,
      hauteur: f.properties.hauteur ?? null,
      cleabs: f.properties.cleabs ?? "",
    };
  });
}

function convertirRelatif(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  origine: OrigineLocale,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const conv = (coords: number[][]) =>
    coords.map(([x, y, ...rest]) => [x - origine.x, y - origine.y, ...rest]);

  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map(conv) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geom.coordinates.map((p) => p.map(conv)),
  };
}
