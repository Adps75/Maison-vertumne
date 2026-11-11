/**
 * Masque du rendu réaliste — fonctions pures.
 *
 * Masque brut = silhouettes des végétaux + contour du massif (rendus par la scène 3D,
 * terrain et bâtiments en occultants : la maison et le ciel restent à 0)
 *              ∪ ombres et végétaux de la couche 3D (alpha > seuil).
 * Masque final = masque brut élargi de ELARGISSEMENT_PX, puis transition progressive
 * jusqu'à 0. Au-delà de la transition, la valeur est exactement 0 : pixel d'origine.
 */

import { creerMasque, type ImageRGBA, type Masque, type Rect } from "./image";

/** Élargissement du masque autour des végétaux, ombres et massif, en pixels. */
export const ELARGISSEMENT_PX = 30;
/** Seuil d'alpha de la couche 3D au-delà duquel un pixel (plante ou ombre) compte. */
export const SEUIL_ALPHA_COUCHE = 6;

/** Largeur de la transition progressive : 1 % du grand côté, 24 px au minimum. */
export function largeurTransition(largeur: number, hauteur: number): number {
  return Math.max(24, Math.round(0.01 * Math.max(largeur, hauteur)));
}

/**
 * Union du masque brut rendu par la scène et de l'alpha de la couche 3D
 * (végétaux et ombres projetées au sol).
 */
export function fusionnerMasqueBrut(
  masqueScene: Masque,
  couche: ImageRGBA,
  seuilAlpha = SEUIL_ALPHA_COUCHE,
): Masque {
  if (masqueScene.largeur !== couche.largeur || masqueScene.hauteur !== couche.hauteur) {
    throw new Error("fusionnerMasqueBrut : tailles différentes");
  }
  const out = creerMasque(couche.largeur, couche.hauteur);
  const c = couche.donnees;
  for (let i = 0; i < out.valeurs.length; i++) {
    out.valeurs[i] = masqueScene.valeurs[i] > 127 || c[i * 4 + 3] > seuilAlpha ? 255 : 0;
  }
  return out;
}

/**
 * Distance euclidienne de chaque pixel au pixel actif (> 127) le plus proche
 * (transformée exacte de Felzenszwalb et Huttenlocher, séparable).
 */
export function distanceAuMasque(m: Masque): Float32Array {
  const { largeur: L, hauteur: H } = m;
  const INF = 1e20;
  const d2 = new Float64Array(L * H);
  for (let i = 0; i < d2.length; i++) d2[i] = m.valeurs[i] > 127 ? 0 : INF;

  const n = Math.max(L, H);
  const f = new Float64Array(n);
  const dist = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  const passe1D = (len: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      dist[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  // Colonnes
  for (let x = 0; x < L; x++) {
    for (let y = 0; y < H; y++) f[y] = d2[y * L + x];
    passe1D(H);
    for (let y = 0; y < H; y++) d2[y * L + x] = dist[y];
  }
  // Lignes
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) f[x] = d2[y * L + x];
    passe1D(L);
    for (let x = 0; x < L; x++) d2[y * L + x] = dist[x];
  }

  const out = new Float32Array(L * H);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(d2[i]);
  return out;
}

/**
 * Masque final : 255 jusqu'à `elargissement` px du masque brut, puis transition
 * progressive (courbe douce) jusqu'à 0 sur `transition` px, 0 au-delà.
 */
export function masqueFinal(
  brut: Masque,
  elargissement = ELARGISSEMENT_PX,
  transition = largeurTransition(brut.largeur, brut.hauteur),
): Masque {
  const d = distanceAuMasque(brut);
  const out = creerMasque(brut.largeur, brut.hauteur);
  for (let i = 0; i < d.length; i++) {
    const di = d[i];
    if (di <= elargissement) out.valeurs[i] = 255;
    else if (di < elargissement + transition) {
      const t = 1 - (di - elargissement) / transition; // 1 → 0
      const lisse = t * t * (3 - 2 * t); // smoothstep
      out.valeurs[i] = Math.max(1, Math.round(255 * lisse));
    } else out.valeurs[i] = 0;
  }
  return out;
}

/** Rectangle englobant des pixels non nuls, ou null si le masque est vide. */
export function boiteEnglobante(m: Masque): Rect | null {
  let xMin = Infinity, yMin = Infinity, xMax = -1, yMax = -1;
  for (let y = 0; y < m.hauteur; y++) {
    const ligne = y * m.largeur;
    for (let x = 0; x < m.largeur; x++) {
      if (m.valeurs[ligne + x] > 0) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }
  if (xMax < 0) return null;
  return { x: xMin, y: yMin, largeur: xMax - xMin + 1, hauteur: yMax - yMin + 1 };
}

/**
 * Masque au format de l'endpoint d'édition : PNG RGBA de même taille que l'image,
 * pixels transparents (alpha 0) = zone à modifier, opaques = à conserver.
 */
export function masquePourApi(m: Masque): ImageRGBA {
  const donnees = new Uint8Array(m.largeur * m.hauteur * 4);
  for (let i = 0; i < m.valeurs.length; i++) {
    donnees[i * 4 + 3] = m.valeurs[i] > 0 ? 0 : 255;
  }
  return { largeur: m.largeur, hauteur: m.hauteur, donnees };
}
