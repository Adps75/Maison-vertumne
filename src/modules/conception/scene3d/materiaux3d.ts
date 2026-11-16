/**
 * Géométrie des matériaux dans la scène 3D — fonctions pures (sans Three.js).
 * Coordonnées 3D : x = x plan, y = altitude, z = -y plan (voir conversion.ts).
 */

import type { Pt } from "../geo/plan";

/** Hauteur des surfaces de matériau au-dessus du terrain (évite le scintillement). */
export const DECALAGE_SURFACE = 0.02;
/** Pas d'échantillonnage d'une bande le long de son tracé (suit le relief). */
export const PAS_BANDE = 0.25;

export interface GeometrieBrute {
  positions: number[];
  indices: number[];
}

/**
 * Bande d'un matériau linéaire (volige, bordure) : volume à sa largeur et sa hauteur hors
 * sol, échantillonné le long du tracé pour suivre le relief (enterré de 2 cm).
 */
export function geometrieBande(points: Pt[], largeur: number, hauteur: number, altitudeEn: (x: number, y: number) => number): GeometrieBrute {
  const positions: number[] = [];
  const indices: number[] = [];
  const demi = Math.max(0.005, largeur / 2);
  // Échantillons le long du tracé, avec la normale de leur segment
  const ech: { p: Pt; n: Pt }[] = [];
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    const n: Pt = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    const pas = Math.max(1, Math.ceil(l / PAS_BANDE));
    for (let k = 0; k <= pas; k++) {
      if (k === 0 && ech.length > 0) continue;
      const t = k / pas;
      ech.push({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], n });
    }
  }
  for (const { p, n } of ech) {
    const sol = altitudeEn(p[0], p[1]);
    for (const [cote, h] of [[-1, sol - 0.02], [-1, sol + hauteur], [1, sol + hauteur], [1, sol - 0.02]] as const) {
      const x = p[0] + cote * n[0] * demi, y = p[1] + cote * n[1] * demi;
      positions.push(x, h, -y || 0);
    }
  }
  // Faces entre échantillons : flanc gauche, dessus, flanc droit
  for (let i = 0; i < ech.length - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (const [u, v] of [[0, 1], [1, 2], [2, 3]]) indices.push(a + u, b + u, b + v, a + u, b + v, a + v);
  }
  return { positions, indices };
}

/** Coordonnées de texture « monde » : la texture couvre `taille` mètres, répétée. */
export function uvMonde(positions: ArrayLike<number>, taille: number): number[] {
  const uv: number[] = [];
  const t = taille > 0 ? taille : 1;
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / t, -positions[i + 2] / t);
  return uv;
}
