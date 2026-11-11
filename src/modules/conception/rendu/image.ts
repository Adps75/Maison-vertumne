/**
 * Types d'images brutes manipulées par le rendu — fonctions pures, sans dépendance.
 */

/** Image RGBA 8 bits, alpha non prémultiplié, lignes de haut en bas. */
export interface ImageRGBA {
  largeur: number;
  hauteur: number;
  donnees: Uint8Array | Uint8ClampedArray;
}

/** Masque 8 bits : 0 = original conservé, 255 = zone modifiable. */
export interface Masque {
  largeur: number;
  hauteur: number;
  valeurs: Uint8Array;
}

/** Rectangle en pixels. */
export interface Rect {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export function creerImage(largeur: number, hauteur: number): ImageRGBA {
  return { largeur, hauteur, donnees: new Uint8Array(largeur * hauteur * 4) };
}

export function creerMasque(largeur: number, hauteur: number): Masque {
  return { largeur, hauteur, valeurs: new Uint8Array(largeur * hauteur) };
}

/** Extrait un rectangle d'une image. */
export function extraireRect(img: ImageRGBA, r: Rect): ImageRGBA {
  const out = creerImage(r.largeur, r.hauteur);
  for (let y = 0; y < r.hauteur; y++) {
    const src = ((r.y + y) * img.largeur + r.x) * 4;
    out.donnees.set(img.donnees.subarray(src, src + r.largeur * 4), y * r.largeur * 4);
  }
  return out;
}

/** Extrait un rectangle d'un masque. */
export function extraireRectMasque(m: Masque, r: Rect): Masque {
  const out = creerMasque(r.largeur, r.hauteur);
  for (let y = 0; y < r.hauteur; y++) {
    const src = (r.y + y) * m.largeur + r.x;
    out.valeurs.set(m.valeurs.subarray(src, src + r.largeur), y * r.largeur);
  }
  return out;
}

/** Convertit un rendu WebGL (alpha prémultiplié) en alpha non prémultiplié, sur place. */
export function depremultiplier(donnees: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < donnees.length; i += 4) {
    const a = donnees[i + 3];
    if (a === 0 || a === 255) continue;
    donnees[i] = Math.min(255, Math.round((donnees[i] * 255) / a));
    donnees[i + 1] = Math.min(255, Math.round((donnees[i + 1] * 255) / a));
    donnees[i + 2] = Math.min(255, Math.round((donnees[i + 2] * 255) / a));
  }
}

/** Retourne verticalement des pixels lus par WebGL (origine en bas), sur place. */
export function retournerVerticalement(donnees: Uint8Array | Uint8ClampedArray, largeur: number, hauteur: number, canaux = 4): void {
  const ligne = largeur * canaux;
  const tmp = new Uint8Array(ligne);
  for (let y = 0; y < Math.floor(hauteur / 2); y++) {
    const a = y * ligne;
    const b = (hauteur - 1 - y) * ligne;
    tmp.set(donnees.subarray(a, a + ligne));
    donnees.copyWithin(a, b, b + ligne);
    donnees.set(tmp, b);
  }
}

/**
 * Superpose une couche (alpha non prémultiplié) sur une photo opaque.
 * Les deux images doivent avoir la même taille.
 */
export function superposer(photo: ImageRGBA, couche: ImageRGBA): ImageRGBA {
  if (photo.largeur !== couche.largeur || photo.hauteur !== couche.hauteur) {
    throw new Error("superposer : tailles différentes");
  }
  const out = creerImage(photo.largeur, photo.hauteur);
  const p = photo.donnees, c = couche.donnees, o = out.donnees;
  for (let i = 0; i < o.length; i += 4) {
    const a = c[i + 3];
    if (a === 0) {
      o[i] = p[i]; o[i + 1] = p[i + 1]; o[i + 2] = p[i + 2];
    } else if (a === 255) {
      o[i] = c[i]; o[i + 1] = c[i + 1]; o[i + 2] = c[i + 2];
    } else {
      const k = a / 255;
      o[i] = Math.round(c[i] * k + p[i] * (1 - k));
      o[i + 1] = Math.round(c[i + 1] * k + p[i + 1] * (1 - k));
      o[i + 2] = Math.round(c[i + 2] * k + p[i + 2] * (1 - k));
    }
    o[i + 3] = 255;
  }
  return out;
}
