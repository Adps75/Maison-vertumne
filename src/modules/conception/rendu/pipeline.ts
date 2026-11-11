/**
 * Chaîne de rendu des vues (côté serveur) : décodage, masque, recadrage, appel au
 * modèle d'image, recollage. Le fournisseur est injecté (`editer`), ce qui permet
 * de le simuler dans les tests.
 */

import sharp from "sharp";
import {
  extraireRect, extraireRectMasque, superposer,
  type ImageRGBA, type Masque, type Rect,
} from "./image";
import { boiteEnglobante, fusionnerMasqueBrut, masqueFinal, masquePourApi } from "./masque";
import { recadrageAutour, tailleModele } from "./recadrage";
import { recoller } from "./recollage";
import { filtreDessin } from "./filtre-dessin";
import { CONSIGNE_DESSIN_IA, CONSIGNE_REALISTE } from "./consignes";

export interface UsageModele {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

/** Appel d'édition au modèle d'image (fournisseur interchangeable). */
export type Editeur = (
  consigne: string,
  imagePng: Buffer,
  options: { masquePng?: Buffer; taille: string },
) => Promise<{ buffer: Buffer; usage: UsageModele }>;

// ─── Conversions sharp ⇄ images brutes ─────────────────────────────────

/** Décode une image (orientation EXIF appliquée) en RGBA brut. */
export async function decoder(buffer: Buffer): Promise<ImageRGBA> {
  const { data, info } = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Décode un masque (niveaux de gris ou premier canal). */
export async function decoderMasque(buffer: Buffer): Promise<Masque> {
  const { data, info } = await sharp(buffer).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, valeurs: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export async function encoderPng(img: ImageRGBA): Promise<Buffer> {
  return sharp(Buffer.from(img.donnees.buffer, img.donnees.byteOffset, img.donnees.length), {
    raw: { width: img.largeur, height: img.hauteur, channels: 4 },
  }).png().toBuffer();
}

export async function encoderMasquePng(m: Masque): Promise<Buffer> {
  return sharp(Buffer.from(m.valeurs.buffer, m.valeurs.byteOffset, m.valeurs.length), {
    raw: { width: m.largeur, height: m.hauteur, channels: 1 },
  }).png().toBuffer();
}

export async function redimensionner(img: ImageRGBA, largeur: number, hauteur: number): Promise<ImageRGBA> {
  if (img.largeur === largeur && img.hauteur === hauteur) return img;
  const { data, info } = await sharp(Buffer.from(img.donnees.buffer, img.donnees.byteOffset, img.donnees.length), {
    raw: { width: img.largeur, height: img.hauteur, channels: 4 },
  }).resize(largeur, hauteur, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export async function redimensionnerMasque(m: Masque, largeur: number, hauteur: number): Promise<Masque> {
  if (m.largeur === largeur && m.hauteur === hauteur) return m;
  const { data, info } = await sharp(Buffer.from(m.valeurs.buffer, m.valeurs.byteOffset, m.valeurs.length), {
    raw: { width: m.largeur, height: m.hauteur, channels: 1 },
  }).resize(largeur, hauteur, { fit: "fill", kernel: "nearest" }).raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, valeurs: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

// ─── Rendus ────────────────────────────────────────────────────────────

/** Ramène la couche 3D (et son masque) à la taille de la photo si besoin. */
async function alignerSurPhoto(photo: ImageRGBA, couche: ImageRGBA): Promise<ImageRGBA> {
  return redimensionner(couche, photo.largeur, photo.hauteur);
}

export interface ResultatRendu {
  image: ImageRGBA;
  masque: Masque | null;
  usage: UsageModele | null;
  /** Rectangle envoyé au modèle et taille d'envoi (rendu réaliste). */
  rect?: Rect;
  taille?: { largeur: number; hauteur: number };
}

/**
 * Réaliste masqué : seul le massif (végétaux, ombres, contour, élargis et fondus)
 * est confié au modèle ; tout le reste est la photo d'origine, pixel pour pixel.
 */
export async function rendreRealiste(params: {
  photo: ImageRGBA;
  couche: ImageRGBA;
  masqueScene: Masque;
  editer: Editeur;
}): Promise<ResultatRendu> {
  const { photo, editer } = params;
  const couche = await alignerSurPhoto(photo, params.couche);
  const masqueScene = await redimensionnerMasque(params.masqueScene, photo.largeur, photo.hauteur);

  const masque = masqueFinal(fusionnerMasqueBrut(masqueScene, couche));
  const boite = boiteEnglobante(masque);
  if (!boite) throw new Error("Aucun végétal ni massif visible dans cette vue.");

  const rect = recadrageAutour(boite, photo.largeur, photo.hauteur);
  const taille = tailleModele(rect.largeur, rect.hauteur);

  const vue = superposer(photo, couche);
  const imageEnvoi = await redimensionner(extraireRect(vue, rect), taille.largeur, taille.hauteur);
  const masqueEnvoi = await redimensionnerMasque(extraireRectMasque(masque, rect), taille.largeur, taille.hauteur);

  const reponse = await editer(CONSIGNE_REALISTE, await encoderPng(imageEnvoi), {
    masquePng: await encoderPng(masquePourApi(masqueEnvoi)),
    taille: `${taille.largeur}x${taille.hauteur}`,
  });

  const resultat = await redimensionner(await decoder(reponse.buffer), rect.largeur, rect.hauteur);
  return { image: recoller(photo, resultat, rect, masque), masque, usage: reponse.usage, rect, taille };
}

/** Dessin sans IA : filtre graphique sur la vue complète (photo + végétaux). */
export async function rendreDessinFiltre(params: { photo: ImageRGBA; couche: ImageRGBA }): Promise<ResultatRendu> {
  const couche = await alignerSurPhoto(params.photo, params.couche);
  return { image: filtreDessin(superposer(params.photo, couche)), masque: null, usage: null };
}

/** Dessin avec IA : stylisation de toute la vue, éléments et positions conservés. */
export async function rendreDessinIA(params: { photo: ImageRGBA; couche: ImageRGBA; editer: Editeur }): Promise<ResultatRendu> {
  const { photo, editer } = params;
  const couche = await alignerSurPhoto(photo, params.couche);
  const vue = superposer(photo, couche);
  const taille = tailleModele(photo.largeur, photo.hauteur);
  const envoi = await redimensionner(vue, taille.largeur, taille.hauteur);
  const reponse = await editer(CONSIGNE_DESSIN_IA, await encoderPng(envoi), {
    taille: `${taille.largeur}x${taille.hauteur}`,
  });
  const image = await redimensionner(await decoder(reponse.buffer), photo.largeur, photo.hauteur);
  return { image, masque: null, usage: reponse.usage, taille };
}
