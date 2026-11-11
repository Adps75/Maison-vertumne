/**
 * Recadrage autour du masque et tailles acceptées par le modèle d'image — fonctions pures.
 *
 * Contraintes de l'endpoint d'édition (documentation OpenAI, GPT Image 2 / 2.5) :
 * largeur et hauteur multiples de 16, rapport entre 1:3 et 3:1,
 * entre 655 360 et 8 294 400 pixels. Au-delà de 2560×1440 le rendu est
 * « expérimental » : on plafonne le grand côté à COTE_MAX_MODELE.
 */

import type { Rect } from "./image";

export const COTE_MAX_MODELE = 2048;
export const PIXELS_MIN_MODELE = 655_360;
export const RAPPORT_MAX = 3;

const multiple16 = (v: number) => Math.max(16, Math.round(v / 16) * 16);

/**
 * Taille de sortie acceptée par le modèle pour une image de proportions l×h
 * (proportions conservées à l'arrondi près, au plus près de la résolution d'origine).
 */
export function tailleModele(largeur: number, hauteur: number): { largeur: number; hauteur: number } {
  let l = largeur, h = hauteur;
  // Rapport borné à 3:1
  if (l / h > RAPPORT_MAX) l = h * RAPPORT_MAX;
  if (h / l > RAPPORT_MAX) h = l * RAPPORT_MAX;

  let echelle = Math.min(1, COTE_MAX_MODELE / Math.max(l, h));
  if (l * h * echelle * echelle < PIXELS_MIN_MODELE) echelle = Math.sqrt(PIXELS_MIN_MODELE / (l * h));

  let L = multiple16(l * echelle);
  let H = multiple16(h * echelle);
  // Garantir le minimum de pixels après arrondi, sans dépasser le côté maximal
  while (L * H < PIXELS_MIN_MODELE) {
    if (L <= H && L + 16 <= COTE_MAX_MODELE) L += 16;
    else H += 16;
  }
  while (Math.max(L, H) > COTE_MAX_MODELE) {
    if (L >= H) L -= 16; else H -= 16;
  }
  return { largeur: L, hauteur: H };
}

/**
 * Recadrage autour de la boîte du masque, avec une marge, dans les limites de
 * l'image, et de rapport compris entre 1:3 et 3:1.
 */
export function recadrageAutour(boite: Rect, largeurImage: number, hauteurImage: number): Rect {
  const marge = Math.max(64, Math.round(0.15 * Math.max(boite.largeur, boite.hauteur)));
  let x0 = boite.x - marge;
  let y0 = boite.y - marge;
  let x1 = boite.x + boite.largeur + marge;
  let y1 = boite.y + boite.hauteur + marge;

  // Rapport borné : agrandir le petit côté autour du centre
  const l = x1 - x0, h = y1 - y0;
  if (l / h > RAPPORT_MAX) {
    const manque = l / RAPPORT_MAX - h;
    y0 -= manque / 2; y1 += manque / 2;
  } else if (h / l > RAPPORT_MAX) {
    const manque = h / RAPPORT_MAX - l;
    x0 -= manque / 2; x1 += manque / 2;
  }

  // Décaler dans l'image si possible, puis borner
  const decaler = (a: number, b: number, max: number): [number, number] => {
    if (a < 0) { b -= a; a = 0; }
    if (b > max) { a -= b - max; b = max; }
    return [Math.max(0, Math.floor(a)), Math.min(max, Math.ceil(b))];
  };
  [x0, x1] = decaler(x0, x1, largeurImage);
  [y0, y1] = decaler(y0, y1, hauteurImage);
  return { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 };
}
