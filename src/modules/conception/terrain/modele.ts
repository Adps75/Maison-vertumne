import Delaunator from "delaunator";
import type { GrilleRelief, PointCote } from "./types";
import { altitudeIGN } from "./grille";

/**
 * Construit une fonction altitudeEn(x, y) qui retourne l'altitude relative
 * à la référence du projet (en mètres). C'est la coordonnée Y en 3D.
 *
 * Fusionne la grille IGN et les points cotés :
 * - Chaque point coté a un écart = (altRef + altRelative) - altitudeIGN
 * - Les écarts sont interpolés par triangulation de Delaunay
 * - Hors enveloppe des points cotés : fondu linéaire vers 0 sur distanceFondu
 * - Sans grille IGN : terrain construit uniquement à partir des points cotés
 * - Sans rien : terrain plat à 0.00
 */
export function construireModele(
  grille: GrilleRelief | null,
  pointsCotes: PointCote[],
  altRef: number | null,
  distanceFondu = 5,
): (x: number, y: number) => number {
  const ref = altRef ?? 0;

  // Cas trivial : ni grille ni points cotés
  if (!grille && pointsCotes.length === 0) {
    return () => 0;
  }

  // Calculer les écarts à chaque point coté
  const ecarts: { x: number; y: number; ecart: number }[] = [];
  for (const pc of pointsCotes) {
    if (grille) {
      const zIGN = altitudeIGN(pc.x, pc.y, grille);
      if (zIGN != null) {
        ecarts.push({ x: pc.x, y: pc.y, ecart: (ref + pc.altitudeRelative) - zIGN });
      } else {
        // Point hors grille — on traite comme si pas de grille pour ce point
        ecarts.push({ x: pc.x, y: pc.y, ecart: 0 });
      }
    } else {
      // Sans grille, l'écart n'a pas de sens ; on stocke l'altitude relative directement
      ecarts.push({ x: pc.x, y: pc.y, ecart: pc.altitudeRelative });
    }
  }

  // Triangulation si ≥ 3 points
  let delaunay: Delaunator<Float64Array> | null = null;
  let coords: Float64Array | null = null;
  if (ecarts.length >= 3) {
    coords = new Float64Array(ecarts.length * 2);
    for (let i = 0; i < ecarts.length; i++) {
      coords[i * 2] = ecarts[i].x;
      coords[i * 2 + 1] = ecarts[i].y;
    }
    delaunay = new Delaunator(coords);
  }

  return (x: number, y: number): number => {
    // Altitude IGN de base (relative à la référence)
    let base = 0;
    if (grille) {
      const zIGN = altitudeIGN(x, y, grille);
      if (zIGN != null) {
        base = zIGN - ref;
      }
    }

    // Pas de points cotés → altitude IGN seule
    if (ecarts.length === 0) return base;

    // Interpoler l'écart
    const ecartInterpole = interpolerEcart(x, y, ecarts, delaunay, coords, distanceFondu);

    if (grille) {
      return base + ecartInterpole;
    }
    // Sans grille : l'écart EST l'altitude relative
    return ecartInterpole;
  };
}

/** Interpole l'écart en (x, y) à partir des points cotés. */
function interpolerEcart(
  x: number,
  y: number,
  ecarts: { x: number; y: number; ecart: number }[],
  delaunay: Delaunator<Float64Array> | null,
  coords: Float64Array | null,
  distanceFondu: number,
): number {
  // ≥ 3 points : triangulation de Delaunay
  if (delaunay && coords) {
    const tri = trouverTriangle(x, y, delaunay, coords);
    if (tri) {
      // Interpolation barycentrique
      const [i0, i1, i2] = tri;
      const bary = barycentrique(
        x, y,
        ecarts[i0].x, ecarts[i0].y,
        ecarts[i1].x, ecarts[i1].y,
        ecarts[i2].x, ecarts[i2].y,
      );
      if (bary) {
        return ecarts[i0].ecart * bary[0] + ecarts[i1].ecart * bary[1] + ecarts[i2].ecart * bary[2];
      }
    }
  }

  // Hors enveloppe ou < 3 points : point le plus proche avec fondu
  return ecartHorsEnveloppe(x, y, ecarts, distanceFondu);
}

/** Trouve le triangle contenant (x, y) dans la triangulation. */
function trouverTriangle(
  x: number,
  y: number,
  delaunay: Delaunator<Float64Array>,
  coords: Float64Array,
): [number, number, number] | null {
  const triangles = delaunay.triangles;
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t];
    const i1 = triangles[t + 1];
    const i2 = triangles[t + 2];

    const bary = barycentrique(
      x, y,
      coords[i0 * 2], coords[i0 * 2 + 1],
      coords[i1 * 2], coords[i1 * 2 + 1],
      coords[i2 * 2], coords[i2 * 2 + 1],
    );

    if (bary && bary[0] >= -1e-10 && bary[1] >= -1e-10 && bary[2] >= -1e-10) {
      return [i0, i1, i2];
    }
  }
  return null;
}

/** Coordonnées barycentriques de (px, py) dans le triangle (ax, ay, bx, by, cx, cy). */
function barycentrique(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): [number, number, number] | null {
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(det) < 1e-12) return null;

  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
  const w = 1 - u - v;

  return [u, v, w];
}

/** Écart hors enveloppe : point le plus proche, fondu linéaire vers 0. */
function ecartHorsEnveloppe(
  x: number,
  y: number,
  ecarts: { x: number; y: number; ecart: number }[],
  distanceFondu: number,
): number {
  let minDist = Infinity;
  let ecartProche = 0;

  for (const e of ecarts) {
    const d = Math.sqrt((x - e.x) ** 2 + (y - e.y) ** 2);
    if (d < minDist) {
      minDist = d;
      ecartProche = e.ecart;
    }
  }

  if (minDist === 0) return ecartProche;
  if (minDist >= distanceFondu) return 0;

  // Fondu linéaire
  return ecartProche * (1 - minDist / distanceFondu);
}
