import { contours } from "d3-contour";
import type { CourbeDeNiveau } from "./types";

/**
 * Génère les courbes de niveau sur une emprise donnée.
 * Utilise l'algorithme des carrés marchants via d3-contour.
 *
 * @param altitudeEn - Fonction altitude relative en (x, y)
 * @param emprise - [xMin, yMin, xMax, yMax] en coordonnées plan
 * @param intervalle - Écart entre deux courbes (défaut 0.25 m)
 * @param pasEchantillon - Pas de la grille d'échantillonnage (défaut 0.5 m)
 */
export function genererCourbes(
  altitudeEn: (x: number, y: number) => number,
  emprise: [number, number, number, number],
  intervalle = 0.25,
  pasEchantillon = 0.5,
): CourbeDeNiveau[] {
  const [xMin, yMin, xMax, yMax] = emprise;
  const largeur = xMax - xMin;
  const hauteur = yMax - yMin;
  if (largeur < pasEchantillon || hauteur < pasEchantillon) return [];

  const colonnes = Math.ceil(largeur / pasEchantillon) + 1;
  const lignes = Math.ceil(hauteur / pasEchantillon) + 1;

  // Échantillonner les altitudes
  const values = new Float64Array(colonnes * lignes);
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let iy = 0; iy < lignes; iy++) {
    for (let ix = 0; ix < colonnes; ix++) {
      const x = xMin + ix * pasEchantillon;
      const y = yMin + iy * pasEchantillon;
      const z = altitudeEn(x, y);
      values[iy * colonnes + ix] = z;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
  }

  // Pas de relief → pas de courbes
  if (zMax - zMin < intervalle * 0.5) return [];

  // Niveaux des courbes
  const niveauMin = Math.ceil(zMin / intervalle) * intervalle;
  const niveauMax = Math.floor(zMax / intervalle) * intervalle;
  const thresholds: number[] = [];
  for (let n = niveauMin; n <= niveauMax + intervalle * 0.01; n += intervalle) {
    thresholds.push(Math.round(n * 1000) / 1000);
  }

  if (thresholds.length === 0) return [];

  // d3-contour : génère les isolignes
  const generator = contours()
    .size([colonnes, lignes])
    .thresholds(thresholds);

  const multiPolygons = generator(Array.from(values));
  const courbes: CourbeDeNiveau[] = [];

  for (const mp of multiPolygons) {
    const altitude = mp.value;
    for (const polygon of mp.coordinates) {
      for (const ring of polygon) {
        // Convertir les indices de grille en coordonnées plan
        const points: [number, number][] = ring.map(([gx, gy]) => [
          xMin + gx * pasEchantillon,
          yMin + gy * pasEchantillon,
        ]);
        if (points.length >= 2) {
          courbes.push({ altitude, points });
        }
      }
    }
  }

  return courbes;
}
