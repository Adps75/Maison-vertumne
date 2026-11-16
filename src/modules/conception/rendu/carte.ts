/**
 * Carte des matériaux (même cadrage que la photo) : chaque matériau en couleur franche,
 * le reste en noir — fonctions pures. Elle accompagne la photo envoyée au modèle, et sert
 * aux passes par matériau (masque limité à la zone d'un matériau).
 */

import { creerMasque, type ImageRGBA, type Masque } from "./image";

/** Écart maximal (somme des canaux) pour reconnaître une couleur de la carte. */
const TOLERANCE = 60;

const proche = (d: Uint8Array | Uint8ClampedArray, j: number, rgb: [number, number, number], tol = TOLERANCE) =>
  Math.abs(d[j] - rgb[0]) + Math.abs(d[j + 1] - rgb[1]) + Math.abs(d[j + 2] - rgb[2]) <= tol;

/** Matériaux présents sur la carte, avec leur nombre de pixels (au moins `minimum`). */
export function couleursPresentes<T extends { rgb: [number, number, number] }>(carte: ImageRGBA, couleurs: T[], minimum = 30): (T & { pixels: number })[] {
  const comptes = couleurs.map(() => 0);
  const d = carte.donnees;
  for (let j = 0; j < d.length; j += 4) {
    if (d[j] + d[j + 1] + d[j + 2] < 60) continue; // noir
    const k = couleurs.findIndex((c) => proche(d, j, c.rgb));
    if (k >= 0) comptes[k]++;
  }
  return couleurs.map((c, k) => ({ ...c, pixels: comptes[k] })).filter((c) => c.pixels >= minimum);
}

/** Masque (255) des pixels d'une couleur de la carte. */
export function masqueCouleur(carte: ImageRGBA, rgb: [number, number, number]): Masque {
  const m = creerMasque(carte.largeur, carte.hauteur);
  const d = carte.donnees;
  for (let i = 0, j = 0; i < m.valeurs.length; i++, j += 4) if (proche(d, j, rgb)) m.valeurs[i] = 255;
  return m;
}

/** La carte contient-elle au moins un matériau (pixel non noir) ? */
export function carteNonVide(carte: ImageRGBA, minimum = 30): boolean {
  let n = 0;
  const d = carte.donnees;
  for (let j = 0; j < d.length; j += 4) if (d[j] + d[j + 1] + d[j + 2] >= 60 && ++n >= minimum) return true;
  return false;
}
