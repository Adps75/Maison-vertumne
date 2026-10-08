/**
 * Prépare les données de la scène 3D à partir des données API et des éléments.
 */

import type { Pt } from "../geo/plan";
import { cercleVersPolygone } from "../geo/plan";
import { emprise3D, type Batiment3D } from "../geo/emprise3d";
import type { Element } from "../types";
import type { DonneesScene3D, Surface3D, Vegetal3D } from "./types";

/** Couleurs par défaut par nom de calque. */
const COULEURS_CALQUES: Record<string, string> = {
  sols: "#E07830",
  mineral: "#50B8E0",
  vegetal: "#40D870",
  existant: "#E8E050",
};

/** Données brutes du projet (sous-ensemble de la réponse API). */
export interface ProjetPour3D {
  parcelles_geojson: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  batiments_geojson: Batiment3D[];
  ortho_url: string | null;
  ortho_emprise: [number, number, number, number] | null;
}

/**
 * Transforme les données du projet et les éléments en DonneesScene3D.
 *
 * @param projet Données du projet (depuis l'API)
 * @param elements Tableau des éléments du projet
 * @param zoneId ID de la zone à afficher (null = tout le jardin)
 * @param couleursCalques Couleurs personnalisées des calques (optionnel)
 */
export function preparerDonneesScene(
  projet: ProjetPour3D,
  elements: Element[],
  zoneId: string | null = null,
  couleursCalques?: Record<string, string>,
  altitudeEn?: ((x: number, y: number) => number) | null,
): DonneesScene3D {
  const couleurs = { ...COULEURS_CALQUES, ...couleursCalques };

  // 1. Déterminer les points de la zone
  const zonePoints = determinerZonePoints(elements, zoneId, projet);

  // 2. Calculer l'emprise et filtrer les bâtiments
  const { emprise, batiments } = emprise3D(
    zonePoints,
    projet.batiments_geojson,
  );

  // 3. Filtrer les éléments dans l'emprise
  const surfaces: Surface3D[] = [];
  const vegetaux: Vegetal3D[] = [];

  for (const el of elements) {
    if (el.type === "sol" || el.type === "mineral") {
      const points = extrairePointsSurface(el);
      if (points && pointsDansEmprise(points, emprise)) {
        surfaces.push({
          id: el.id,
          points,
          couleur: couleurs[el.calque] ?? "#888888",
        });
      }
    } else if (el.type === "vegetal" && el.geometrie.type === "point") {
      const pos = el.geometrie.position;
      if (pointDansEmprise(pos, emprise)) {
        const planteId = el.proprietes.plante_id as string | undefined;
        const version = el.proprietes.version as string | undefined;
        if (planteId) {
          vegetaux.push({
            id: el.id,
            position: pos,
            hauteur_m: el.proprietes.hauteur_m as number ?? el.hauteur ?? 2,
            diametre_m: el.proprietes.diametre_m as number ?? 1,
            plante_id: planteId,
            version: version ?? "",
            imageUrl: `/api/conception/plantes/${planteId}/image/face?v=${encodeURIComponent(version ?? "")}`,
            altitudeRelative: altitudeEn ? altitudeEn(pos[0], pos[1]) : 0,
          });
        }
      }
    }
  }

  return {
    emprise,
    orthoUrl: projet.ortho_url,
    orthoEmprise: projet.ortho_emprise,
    batiments,
    surfaces,
    vegetaux,
    altitudeEn: altitudeEn ?? null,
  };
}

/** Détermine les points de la zone à visualiser. */
function determinerZonePoints(
  elements: Element[],
  zoneId: string | null,
  projet: ProjetPour3D,
): Pt[] {
  // Zone sélectionnée
  if (zoneId) {
    const zone = elements.find((el) => el.id === zoneId && el.type === "zone");
    if (zone) {
      return extrairePointsSurface(zone) ?? [];
    }
  }

  // Première zone disponible
  const premiereZone = elements.find((el) => el.type === "zone");
  if (premiereZone) {
    return extrairePointsSurface(premiereZone) ?? [];
  }

  // Pas de zone → bbox de la parcelle
  return bboxParcelle(projet.parcelles_geojson);
}

/** Extrait les points d'un polygone, rectangle ou cercle en tableau de Pt. */
function extrairePointsSurface(el: Element): Pt[] | null {
  const g = el.geometrie;
  if (g.type === "polygone" || g.type === "rectangle") {
    return g.points.length >= 3 ? g.points : null;
  }
  if (g.type === "cercle") {
    return cercleVersPolygone(g.centre[0], g.centre[1], g.rayon, 32);
  }
  return null;
}

/** Extrait la bbox d'une parcelle GeoJSON comme polygone rectangulaire. */
function bboxParcelle(geojson: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): Pt[] {
  const allPoints: Pt[] = [];

  if (geojson.type === "MultiPolygon") {
    for (const poly of geojson.coordinates as number[][][][]) {
      for (const ring of poly) {
        for (const coord of ring) {
          allPoints.push([coord[0], coord[1]]);
        }
      }
    }
  } else {
    for (const ring of geojson.coordinates as number[][][]) {
      for (const coord of ring) {
        allPoints.push([coord[0], coord[1]]);
      }
    }
  }

  if (allPoints.length === 0) return [];

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [x, y] of allPoints) {
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  return [
    [xMin, yMin],
    [xMax, yMin],
    [xMax, yMax],
    [xMin, yMax],
  ];
}

/** Vérifie qu'au moins un point du polygone est dans l'emprise. */
function pointsDansEmprise(
  points: Pt[],
  emprise: [number, number, number, number],
): boolean {
  return points.some((p) => pointDansEmprise(p, emprise));
}

/** Vérifie qu'un point est dans l'emprise. */
function pointDansEmprise(
  point: Pt,
  emprise: [number, number, number, number],
): boolean {
  return (
    point[0] >= emprise[0] &&
    point[0] <= emprise[2] &&
    point[1] >= emprise[1] &&
    point[1] <= emprise[3]
  );
}
