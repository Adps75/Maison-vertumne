/**
 * Calcul du champ de vision vertical à partir de la focale équivalente 35 mm.
 *
 * La focale équivalente 35 mm se rapporte à la DIAGONALE du format 24×36 mm
 * (43,27 mm). On calcule d'abord l'angle diagonal, puis on en déduit l'angle
 * vertical selon le rapport largeur/hauteur réel de la photo.
 */

const DEG = Math.PI / 180;
const DIAG_35MM = Math.sqrt(24 ** 2 + 36 ** 2); // ≈ 43.27 mm

/** Focale équivalente par défaut (smartphone courant). */
export const FOCALE_35MM_DEFAUT = 26;

/**
 * Calcule le champ de vision vertical en degrés.
 *
 * @param focale35mm - Focale équivalente 35 mm en millimètres.
 * @param aspect - Rapport largeur / hauteur de la photo (ex. 4/3 = 1.333).
 */
export function vfovFromFocal35mm(focale35mm: number, aspect: number): number {
  // Angle diagonal
  const dfov = 2 * Math.atan(DIAG_35MM / (2 * focale35mm));

  // tan(dfov/2)² = tan(hfov/2)² + tan(vfov/2)²
  // aspect = tan(hfov/2) / tan(vfov/2)
  // => tan(vfov/2) = tan(dfov/2) / sqrt(aspect² + 1)
  const tanVfovHalf = Math.tan(dfov / 2) / Math.sqrt(aspect ** 2 + 1);
  const vfov = 2 * Math.atan(tanVfovHalf);

  return vfov / DEG;
}
