import type { GrilleRelief } from "./types";

/**
 * Interpolation bilinéaire dans la grille IGN.
 * Retourne l'altitude NGF au point (x, y) en coordonnées relatives au projet,
 * ou null si le point est hors grille.
 */
export function altitudeIGN(x: number, y: number, grille: GrilleRelief): number | null {
  const gx = (x - grille.origine[0]) / grille.pas;
  const gy = (y - grille.origine[1]) / grille.pas;

  // Indices entiers
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  // Hors grille
  if (ix < 0 || iy < 0 || ix >= grille.colonnes - 1 || iy >= grille.lignes - 1) {
    // Cas limite : exactement sur le bord droit/haut
    if (ix === grille.colonnes - 1 && gx === ix && iy >= 0 && iy < grille.lignes) {
      return grille.altitudes[iy * grille.colonnes + ix];
    }
    if (iy === grille.lignes - 1 && gy === iy && ix >= 0 && ix < grille.colonnes) {
      return grille.altitudes[iy * grille.colonnes + ix];
    }
    return null;
  }

  // Fractions
  const fx = gx - ix;
  const fy = gy - iy;

  // Quatre coins
  const z00 = grille.altitudes[iy * grille.colonnes + ix];
  const z10 = grille.altitudes[iy * grille.colonnes + ix + 1];
  const z01 = grille.altitudes[(iy + 1) * grille.colonnes + ix];
  const z11 = grille.altitudes[(iy + 1) * grille.colonnes + ix + 1];

  // Interpolation bilinéaire
  return (
    z00 * (1 - fx) * (1 - fy) +
    z10 * fx * (1 - fy) +
    z01 * (1 - fx) * fy +
    z11 * fx * fy
  );
}
