/**
 * Recollage du résultat de l'IA dans la photo d'origine — fonction pure.
 *
 * Seuls les pixels où le masque est non nul sont modifiés, en fondu selon la valeur
 * du masque. Partout où le masque vaut 0, le pixel est celui de l'original, à l'identique.
 */

import { creerImage, type ImageRGBA, type Masque, type Rect } from "./image";

/**
 * @param original photo d'origine, pleine résolution
 * @param resultat résultat de l'IA, à la taille du rectangle `rect`
 * @param rect position du résultat dans l'original
 * @param masque masque final, pleine résolution
 */
export function recoller(original: ImageRGBA, resultat: ImageRGBA, rect: Rect, masque: Masque): ImageRGBA {
  if (resultat.largeur !== rect.largeur || resultat.hauteur !== rect.hauteur) {
    throw new Error("recoller : le résultat doit avoir la taille du rectangle");
  }
  if (masque.largeur !== original.largeur || masque.hauteur !== original.hauteur) {
    throw new Error("recoller : le masque doit avoir la taille de l'original");
  }
  const out = creerImage(original.largeur, original.hauteur);
  out.donnees.set(original.donnees);
  const o = out.donnees, src = original.donnees, r = resultat.donnees;

  for (let y = 0; y < rect.hauteur; y++) {
    const yy = rect.y + y;
    for (let x = 0; x < rect.largeur; x++) {
      const xx = rect.x + x;
      const m = masque.valeurs[yy * original.largeur + xx];
      if (m === 0) continue; // original conservé à l'identique
      const i = (yy * original.largeur + xx) * 4;
      const j = (y * rect.largeur + x) * 4;
      if (m === 255) {
        o[i] = r[j]; o[i + 1] = r[j + 1]; o[i + 2] = r[j + 2];
      } else {
        const k = m / 255;
        o[i] = Math.round(src[i] + (r[j] - src[i]) * k);
        o[i + 1] = Math.round(src[i + 1] + (r[j + 1] - src[i + 1]) * k);
        o[i + 2] = Math.round(src[i + 2] + (r[j + 2] - src[i + 2]) * k);
      }
      o[i + 3] = 255;
    }
  }
  return out;
}
