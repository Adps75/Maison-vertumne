/**
 * Conversion entre coordonnées terrain (mètres relatifs, Y nord = positif)
 * et coordonnées écran Konva (Y vers le bas).
 *
 * Règle : Y écran = -Y terrain. Les images et textes restent droits.
 * Cette fonction est le SEUL point de conversion terrain ↔ écran.
 */

export interface PointTerrain {
  x: number; // mètres relatifs, est = positif
  y: number; // mètres relatifs, nord = positif
}

export interface PointEcran {
  x: number; // pixels Konva
  y: number; // pixels Konva (bas = positif)
}

/** Convertit un point terrain en point écran Konva. */
export function terrainVersEcran(pt: PointTerrain): PointEcran {
  return { x: pt.x, y: -pt.y };
}

/** Convertit un point écran Konva en point terrain. */
export function ecranVersTerrain(pt: PointEcran): PointTerrain {
  return { x: pt.x, y: -pt.y };
}

/** Convertit un tableau de coordonnées terrain [x, y] en points écran aplatis pour Konva. */
export function coordonneesVersEcran(coords: number[][]): number[] {
  const result: number[] = [];
  for (const [x, y] of coords) {
    result.push(x, -y);
  }
  return result;
}

/** Distance en mètres entre deux points terrain. */
export function distanceTerrain(a: PointTerrain, b: PointTerrain): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
