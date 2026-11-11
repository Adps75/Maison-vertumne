/**
 * Dessin sans IA : filtre graphique sur toute l'image — fonction pure, fidèle à 100 %
 * (aucun élément ajouté, retiré ni déplacé).
 *
 * 1. léger flou (aplats) ; 2. couleurs simplifiées par paliers ;
 * 3. lavis aquarelle : couleurs adoucies vers le papier, éventuellement teintées
 *    par la charte ; 4. contours à l'encre (gradient de luminance).
 */

import { creerImage, type ImageRGBA } from "./image";

/** Couleurs de la charte (papier, encre, laiton). */
export const CHARTE = {
  papier: [0xf2, 0xf0, 0xe9] as const,
  encre: [0x1a, 0x27, 0x1f] as const,
  laiton: [0x9c, 0x7c, 0x3c] as const,
};

export interface OptionsDessin {
  /** Nombre de paliers par canal (aplats). */
  paliers?: number;
  /** Part de papier dans le lavis (0 à 1). */
  lavis?: number;
  /** Teinte légère de la charte (laiton) dans les couleurs (0 à 1). */
  teinteCharte?: number;
  /** Seuil du gradient pour tracer un contour (0 à 255). */
  seuilContour?: number;
}

/** Flou boîte séparable, rayon r, sur les 3 canaux couleur. */
function flou(img: ImageRGBA, r: number): Float32Array {
  const { largeur: L, hauteur: H } = img;
  const tmp = new Float32Array(L * H * 3);
  const out = new Float32Array(L * H * 3);
  const n = 2 * r + 1;
  // Horizontal
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += img.donnees[(y * L + Math.min(L - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < L; x++) {
        tmp[(y * L + x) * 3 + c] = s / n;
        const sortant = Math.max(0, x - r);
        const entrant = Math.min(L - 1, x + r + 1);
        s += img.donnees[(y * L + entrant) * 4 + c] - img.donnees[(y * L + sortant) * 4 + c];
      }
    }
  }
  // Vertical
  for (let x = 0; x < L; x++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[(Math.min(H - 1, Math.max(0, k)) * L + x) * 3 + c];
      for (let y = 0; y < H; y++) {
        out[(y * L + x) * 3 + c] = s / n;
        const sortant = Math.max(0, y - r);
        const entrant = Math.min(H - 1, y + r + 1);
        s += tmp[(entrant * L + x) * 3 + c] - tmp[(sortant * L + x) * 3 + c];
      }
    }
  }
  return out;
}

export function filtreDessin(img: ImageRGBA, options: OptionsDessin = {}): ImageRGBA {
  const paliers = options.paliers ?? 7;
  const lavis = options.lavis ?? 0.22;
  const teinte = options.teinteCharte ?? 0.06;
  const seuil = options.seuilContour ?? 28;
  const { largeur: L, hauteur: H } = img;

  const r = Math.max(1, Math.round(Math.max(L, H) / 900));
  const lisse = flou(img, r);

  // Luminance lissée pour les contours
  const lum = new Float32Array(L * H);
  for (let i = 0; i < L * H; i++) {
    lum[i] = 0.299 * lisse[i * 3] + 0.587 * lisse[i * 3 + 1] + 0.114 * lisse[i * 3 + 2];
  }

  const out = creerImage(L, H);
  const pas = 255 / (paliers - 1);
  const [pr, pg, pb] = CHARTE.papier;
  const [lr, lg, lb] = CHARTE.laiton;
  const [er, eg, eb] = CHARTE.encre;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      // Aplats : paliers par canal
      let rr = Math.round(lisse[i * 3] / pas) * pas;
      let gg = Math.round(lisse[i * 3 + 1] / pas) * pas;
      let bb = Math.round(lisse[i * 3 + 2] / pas) * pas;
      // Lavis : vers le papier, légère teinte de la charte
      rr = rr * (1 - lavis - teinte) + pr * lavis + lr * teinte;
      gg = gg * (1 - lavis - teinte) + pg * lavis + lg * teinte;
      bb = bb * (1 - lavis - teinte) + pb * lavis + lb * teinte;

      // Contours : gradient de Sobel sur la luminance lissée
      const xm = Math.max(0, x - 1), xp = Math.min(L - 1, x + 1);
      const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
      const a = lum[ym * L + xm], b = lum[ym * L + x], c = lum[ym * L + xp];
      const d = lum[y * L + xm], f = lum[y * L + xp];
      const g = lum[yp * L + xm], h = lum[yp * L + x], k = lum[yp * L + xp];
      const gx = (c + 2 * f + k) - (a + 2 * d + g);
      const gy = (g + 2 * h + k) - (a + 2 * b + c);
      const mag = Math.sqrt(gx * gx + gy * gy) / 4;
      if (mag > seuil) {
        const enc = Math.min(0.85, (mag - seuil) / 60);
        rr = rr * (1 - enc) + er * enc;
        gg = gg * (1 - enc) + eg * enc;
        bb = bb * (1 - enc) + eb * enc;
      }

      const o = i * 4;
      out.donnees[o] = Math.max(0, Math.min(255, Math.round(rr)));
      out.donnees[o + 1] = Math.max(0, Math.min(255, Math.round(gg)));
      out.donnees[o + 2] = Math.max(0, Math.min(255, Math.round(bb)));
      out.donnees[o + 3] = 255;
    }
  }
  return out;
}
