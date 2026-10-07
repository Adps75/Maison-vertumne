/**
 * Conversion de coordonnées plan 2D → Three.js 3D.
 *
 * Plan : X = est, Y = nord (mètres relatifs à l'origine du projet).
 * Three.js : X = est, Y = hauteur, Z = -nord.
 *
 * Zéro dépendance à Three.js — testable en Vitest pur.
 */

import type { Pt } from "../geo/plan";

/** Convertit un point plan (x est, y nord) + hauteur en coordonnées Three.js [x, y, z]. */
export function planVers3D(
  x: number,
  y: number,
  hauteur = 0,
): [number, number, number] {
  return [x, hauteur, -y || 0];
}

/**
 * Convertit des points plan en points pour THREE.Shape (plan XY de la shape).
 * La shape sera ensuite tournée de -π/2 autour de X pour être posée dans le plan XZ.
 * Convention : x shape = x plan, y shape = y plan.
 */
export function pointsPlanVersShape(points: Pt[]): { x: number; y: number }[] {
  return points.map(([x, y]) => ({ x, y }));
}
