import "server-only";

import { l93VersWgs84, type OrigineLocale } from "../geo/projection";
import type { GrilleRelief } from "../terrain/types";
import { altitudeIGN } from "../terrain/grille";

const ENDPOINT = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const RESOURCE_LIDAR = "ign_lidar_hd_mnt_mono_wld";
const RESOURCE_RGE = "ign_rge_alti_wld";
const MAX_POINTS_PAR_REQUETE = 4000; // marge sous la limite de 5 000
const DELAI_ENTRE_REQUETES_MS = 220; // 5 req/s max

interface PointRequete {
  ix: number;
  iy: number;
  lon: number;
  lat: number;
}

/**
 * Récupère la grille d'altitudes IGN sur l'emprise d'un projet.
 * Coordonnées en Lambert 93 absolu ; résultat en coordonnées relatives.
 *
 * Stratégie :
 * 1. Tente d'abord la ressource LiDAR HD (50 cm).
 * 2. Les points à -99999 sont retentés sur RGE ALTI (1 m).
 * 3. En cas d'erreur réseau → retourne null (terrain plat).
 */
export async function recupererGrilleRelief(
  empriseL93: { xMin: number; yMin: number; xMax: number; yMax: number },
  pas: number,
  origine: OrigineLocale,
  marge = 15,
): Promise<GrilleRelief | null> {
  // Fixture pour les tests E2E : plan incliné synthétique
  if (process.env.E2E_RELIEF_FIXTURE === "plan_incline") {
    return genererFixturePlanIncline(empriseL93, pas, origine, marge);
  }

  const xMinAbs = empriseL93.xMin - marge;
  const yMinAbs = empriseL93.yMin - marge;
  const xMaxAbs = empriseL93.xMax + marge;
  const yMaxAbs = empriseL93.yMax + marge;

  const colonnes = Math.ceil((xMaxAbs - xMinAbs) / pas) + 1;
  const lignes = Math.ceil((yMaxAbs - yMinAbs) / pas) + 1;

  // Construire la liste des points en WGS84
  const points: PointRequete[] = [];
  for (let iy = 0; iy < lignes; iy++) {
    for (let ix = 0; ix < colonnes; ix++) {
      const xAbs = xMinAbs + ix * pas;
      const yAbs = yMinAbs + iy * pas;
      const { lon, lat } = l93VersWgs84(xAbs, yAbs);
      points.push({ ix, iy, lon, lat });
    }
  }

  // Requêtes par lots
  const altitudes = new Float64Array(colonnes * lignes);
  try {
    await interrogerParLots(points, RESOURCE_LIDAR, altitudes, colonnes);
  } catch {
    return null;
  }

  // Identifier les points sans donnée LiDAR (z = -99999)
  const pointsSansDonnee: PointRequete[] = [];
  for (let i = 0; i < altitudes.length; i++) {
    if (altitudes[i] <= -99990) {
      const iy = Math.floor(i / colonnes);
      const ix = i % colonnes;
      const p = points[iy * colonnes + ix];
      if (p) pointsSansDonnee.push(p);
    }
  }

  // Repli sur RGE ALTI pour les points sans donnée LiDAR
  if (pointsSansDonnee.length > 0 && pointsSansDonnee.length < altitudes.length) {
    try {
      await interrogerParLots(pointsSansDonnee, RESOURCE_RGE, altitudes, colonnes);
    } catch {
      // On garde les altitudes LiDAR disponibles
    }
  }

  // Si tout est à -99999, le service ne couvre pas la zone
  let toutInvalide = true;
  for (let i = 0; i < altitudes.length; i++) {
    if (altitudes[i] > -99990) { toutInvalide = false; break; }
  }
  if (toutInvalide) return null;

  // Convertir l'origine en relatif
  const origineRelX = xMinAbs - origine.x;
  const origineRelY = yMinAbs - origine.y;

  return {
    origine: [origineRelX, origineRelY],
    pas,
    colonnes,
    lignes,
    altitudes: Array.from(altitudes),
  };
}

/**
 * Calcule l'altitude de référence par défaut :
 * altitude IGN au point le plus proche de la façade du bâtiment principal.
 */
export function calculerAltitudeReference(
  grille: GrilleRelief,
  batiments: { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }[],
): number {
  // Bâtiment principal = le plus grand (par nombre de sommets, heuristique)
  let meilleurPt: [number, number] | null = null;
  let maxSommets = 0;

  for (const bat of batiments) {
    const rings =
      bat.geometry.type === "MultiPolygon"
        ? bat.geometry.coordinates.flat(1)
        : bat.geometry.coordinates;
    const totalSommets = rings.reduce((s, r) => s + r.length, 0);
    if (totalSommets > maxSommets) {
      maxSommets = totalSommets;
      // Premier sommet du bâtiment principal (approximation de la façade)
      if (rings[0] && rings[0][0]) {
        meilleurPt = [rings[0][0][0], rings[0][0][1]];
      }
    }
  }

  if (!meilleurPt) {
    // Pas de bâtiment → centre de la grille
    const cx = grille.origine[0] + (grille.colonnes * grille.pas) / 2;
    const cy = grille.origine[1] + (grille.lignes * grille.pas) / 2;
    meilleurPt = [cx, cy];
  }

  const z = altitudeIGN(meilleurPt[0], meilleurPt[1], grille);
  return z ?? grille.altitudes[0] ?? 0;
}

// ─── Requêtes par lots ───

async function interrogerParLots(
  points: PointRequete[],
  resource: string,
  altitudes: Float64Array,
  colonnes: number,
): Promise<void> {
  for (let i = 0; i < points.length; i += MAX_POINTS_PAR_REQUETE) {
    const lot = points.slice(i, i + MAX_POINTS_PAR_REQUETE);

    const body = {
      lon: lot.map((p) => p.lon.toFixed(8)).join("|"),
      lat: lot.map((p) => p.lat.toFixed(8)).join("|"),
      resource,
      delimiter: "|",
      zonly: "false",
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`IGN altimétrie erreur ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const elevations: { z: number }[] = data.elevations ?? [];

    for (let j = 0; j < elevations.length; j++) {
      const pt = lot[j];
      const idx = pt.iy * colonnes + pt.ix;
      altitudes[idx] = elevations[j].z;
    }

    // Respecter la limite de débit (5 req/s)
    if (i + MAX_POINTS_PAR_REQUETE < points.length) {
      await new Promise((r) => setTimeout(r, DELAI_ENTRE_REQUETES_MS));
    }
  }
}

// ─── Fixture E2E ───

/** Génère un plan incliné synthétique pour les tests (z = 100 + 0.02*x_relatif). */
function genererFixturePlanIncline(
  empriseL93: { xMin: number; yMin: number; xMax: number; yMax: number },
  pas: number,
  origine: OrigineLocale,
  marge: number,
): GrilleRelief {
  const xMinAbs = empriseL93.xMin - marge;
  const yMinAbs = empriseL93.yMin - marge;
  const xMaxAbs = empriseL93.xMax + marge;
  const yMaxAbs = empriseL93.yMax + marge;

  const colonnes = Math.ceil((xMaxAbs - xMinAbs) / pas) + 1;
  const lignes = Math.ceil((yMaxAbs - yMinAbs) / pas) + 1;

  const origineRelX = xMinAbs - origine.x;
  const origineRelY = yMinAbs - origine.y;

  const altitudes: number[] = [];
  for (let iy = 0; iy < lignes; iy++) {
    for (let ix = 0; ix < colonnes; ix++) {
      const xRel = origineRelX + ix * pas;
      // Pente douce : 2 cm par mètre vers l'est
      altitudes.push(100 + 0.02 * xRel);
    }
  }

  return {
    origine: [origineRelX, origineRelY],
    pas,
    colonnes,
    lignes,
    altitudes,
  };
}
