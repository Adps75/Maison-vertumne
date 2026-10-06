/**
 * Calcul de l'emprise 3D pour une zone de travail.
 * Renvoie la zone élargie d'une marge et les bâtiments pertinents.
 */

import type { Pt } from "./plan";
import { dist, pointDansPolygone } from "./plan";

export interface Batiment3D {
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  hauteur: number | null;
  cleabs: string;
}

export interface Emprise3DResult {
  emprise: [number, number, number, number]; // [xMin, yMin, xMax, yMax]
  batiments: Batiment3D[];
}

/**
 * Calcule l'emprise 3D d'une zone.
 * - emprise = bounding box de la zone + marge (défaut 10 m)
 * - bâtiments = ceux qui intersectent l'emprise OU sont à moins de `seuilBatiment` m (défaut 15 m)
 */
export function emprise3D(
  zonePoints: Pt[],
  batiments: Batiment3D[],
  marge = 10,
  seuilBatiment = 15,
): Emprise3DResult {
  if (zonePoints.length < 3) {
    return { emprise: [0, 0, 0, 0], batiments: [] };
  }

  // Bounding box de la zone
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [x, y] of zonePoints) {
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  // Emprise avec marge
  const emprise: [number, number, number, number] = [
    xMin - marge,
    yMin - marge,
    xMax + marge,
    yMax + marge,
  ];

  // Filtrer les bâtiments
  const batimentsFiltres = batiments.filter((bat) => {
    const rings = extraireRings(bat);
    for (const ring of rings) {
      for (const pt of ring) {
        // Dans l'emprise élargie ?
        if (
          pt[0] >= emprise[0] && pt[0] <= emprise[2] &&
          pt[1] >= emprise[1] && pt[1] <= emprise[3]
        ) {
          return true;
        }
        // À moins de seuilBatiment de la zone ?
        if (distancePointAPolygone(pt, zonePoints) <= seuilBatiment) {
          return true;
        }
      }
    }
    return false;
  });

  return { emprise, batiments: batimentsFiltres };
}

/** Extrait les anneaux (rings) d'un bâtiment, quel que soit le type de géométrie. */
function extraireRings(bat: Batiment3D): Pt[][] {
  const geom = bat.geometry;
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as number[][][][]).flatMap((poly) =>
      poly.map((ring) => ring.map(([x, y]) => [x, y] as Pt)),
    );
  }
  return (geom.coordinates as number[][][]).map((ring) =>
    ring.map(([x, y]) => [x, y] as Pt),
  );
}

/** Distance minimale d'un point à un polygone (sommets + segments). */
function distancePointAPolygone(point: Pt, polygon: Pt[]): number {
  if (pointDansPolygone(point, polygon)) return 0;

  let minDist = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const d = distancePointASegment(point, a, b);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Distance d'un point à un segment. */
function distancePointASegment(point: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(point, a);

  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const proj: Pt = [a[0] + t * dx, a[1] + t * dy];
  return dist(point, proj);
}
