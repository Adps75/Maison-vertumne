/**
 * Types propres à la scène 3D.
 * Isolés du types.ts principal (en cours de modification sur l'autre branche).
 */

import type { Pt } from "../geo/plan";
import type { Batiment3D } from "../geo/emprise3d";

export type { Batiment3D };

/** Données nécessaires au rendu de la scène 3D. */
export interface DonneesScene3D {
  /** Emprise en coordonnées plan [xMin, yMin, xMax, yMax]. */
  emprise: [number, number, number, number];
  /** URL signée de l'orthophoto (JPEG). */
  orthoUrl: string | null;
  /** Emprise de l'orthophoto en coordonnées plan [xMin, yMin, xMax, yMax]. */
  orthoEmprise: [number, number, number, number] | null;
  /** Bâtiments filtrés dans l'emprise. */
  batiments: Batiment3D[];
  /** Surfaces dessinées (sol, minéral). */
  surfaces: Surface3D[];
  /** Végétaux placés. */
  vegetaux: Vegetal3D[];
  /** Fonction altitude relative en un point du plan. Null si pas de relief. */
  altitudeEn: ((x: number, y: number) => number) | null;
}

export interface Surface3D {
  id: string;
  /** Points du polygone fermé, coordonnées plan (mètres). */
  points: Pt[];
  /** Couleur hex du calque. */
  couleur: string;
}

export interface Vegetal3D {
  id: string;
  /** Position [x, y] en coordonnées plan. */
  position: Pt;
  /** Hauteur mature en mètres. */
  hauteur_m: number;
  /** Diamètre mature en mètres. */
  diametre_m: number;
  /** ID de la plante (pour l'image). */
  plante_id: string;
  /** Version (updated_at) pour le cache de l'image. */
  version: string;
  /** URL pré-calculée de l'image de face. */
  imageUrl: string;
  /** Altitude relative au point de la plante (pour positionnement 3D). */
  altitudeRelative: number;
}
