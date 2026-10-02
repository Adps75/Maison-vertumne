/**
 * Fonctions géométriques planes (coordonnées en mètres sur un plan).
 * Pas de Turf.js — nos coordonnées ne sont pas en lon/lat.
 */

export type Pt = [number, number];

// ===================== Mesures =====================

/** Surface d'un polygone (formule du lacet), en m². Toujours positif. */
export function surface(polygon: Pt[]): number {
  let s = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
  }
  return Math.abs(s) / 2;
}

/** Périmètre d'un polygone fermé, en mètres. */
export function perimetre(polygon: Pt[]): number {
  let p = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    p += dist(polygon[i], polygon[(i + 1) % n]);
  }
  return p;
}

/** Longueur d'une polyligne ouverte, en mètres. */
export function longueur(points: Pt[]): number {
  let l = 0;
  for (let i = 0; i < points.length - 1; i++) {
    l += dist(points[i], points[i + 1]);
  }
  return l;
}

/** Distance entre deux points. */
export function dist(a: Pt, b: Pt): number {
  return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
}

/** Milieu de deux points. */
export function milieu(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Angle en degrés de a vers b (0 = est, 90 = nord). */
export function angleEntrePoints(a: Pt, b: Pt): number {
  return ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

// ===================== Projections / Intersections =====================

/** Projection orthogonale d'un point sur un segment. Renvoie le point projeté et le paramètre t (0-1 = sur le segment). */
export function projectionSurSegment(
  point: Pt,
  a: Pt,
  b: Pt,
): { projection: Pt; t: number; distance: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    return { projection: a, t: 0, distance: dist(point, a) };
  }

  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const projection: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { projection, t, distance: dist(point, projection) };
}

/** Intersection de deux segments (a1-a2) et (b1-b2). Null si pas d'intersection. */
export function intersectionSegments(
  a1: Pt,
  a2: Pt,
  b1: Pt,
  b2: Pt,
): Pt | null {
  const d1x = a2[0] - a1[0];
  const d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0];
  const d2y = b2[1] - b1[1];

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null; // Parallèles

  const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / denom;
  const u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return [a1[0] + t * d1x, a1[1] + t * d1y];
}

/** Point dans un polygone (ray casting). */
export function pointDansPolygone(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ===================== Offset =====================

/** Décalage d'une polyligne vers la gauche (distance positive) ou la droite (négatif). */
export function decalagePolyligne(points: Pt[], distance: number): Pt[] {
  if (points.length < 2) return [...points];

  const result: Pt[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      result.push(decalerPoint(points[0], points[1], distance));
    } else if (i === points.length - 1) {
      result.push(decalerPoint(points[i - 1], points[i], distance, true));
    } else {
      // Intersection des deux segments décalés
      const aOff = decalerSegment(points[i - 1], points[i], distance);
      const bOff = decalerSegment(points[i], points[i + 1], distance);

      const inter = intersectionDroites(aOff[0], aOff[1], bOff[0], bOff[1]);
      result.push(inter ?? decalerPoint(points[i - 1], points[i], distance, true));
    }
  }

  return result;
}

function decalerPoint(a: Pt, b: Pt, d: number, end = false): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return end ? b : a;

  const nx = -dy / len;
  const ny = dx / len;

  const base = end ? b : a;
  return [base[0] + nx * d, base[1] + ny * d];
}

function decalerSegment(a: Pt, b: Pt, d: number): [Pt, Pt] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [a, b];

  const nx = -dy / len * d;
  const ny = dx / len * d;

  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
  ];
}

function intersectionDroites(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1x = a2[0] - a1[0];
  const d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0];
  const d2y = b2[1] - b1[1];

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / denom;
  return [a1[0] + t * d1x, a1[1] + t * d1y];
}

// ===================== Cercles / Arcs =====================

/** Convertit un cercle paramétrique en polygone approché. */
export function cercleVersPolygone(
  cx: number,
  cy: number,
  rayon: number,
  segments = 64,
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    pts.push([cx + rayon * Math.cos(angle), cy + rayon * Math.sin(angle)]);
  }
  return pts;
}

/** Longueur d'un arc (en mètres). Angles en degrés, sens trigonométrique. */
export function longueurArc(
  rayon: number,
  angleDebut: number,
  angleFin: number,
): number {
  let delta = ((angleFin - angleDebut) % 360 + 360) % 360;
  if (delta === 0) delta = 360;
  return (rayon * delta * Math.PI) / 180;
}

/** Surface d'un cercle. */
export function surfaceCercle(rayon: number): number {
  return Math.PI * rayon * rayon;
}

/** Convertit un arc paramétrique en points pour l'affichage. */
export function arcVersPoints(
  cx: number,
  cy: number,
  rayon: number,
  angleDebut: number,
  angleFin: number,
  segments = 32,
): Pt[] {
  let delta = ((angleFin - angleDebut) % 360 + 360) % 360;
  if (delta === 0) delta = 360;

  const pts: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = ((angleDebut + (delta * i) / segments) * Math.PI) / 180;
    pts.push([cx + rayon * Math.cos(a), cy + rayon * Math.sin(a)]);
  }
  return pts;
}
