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
import { boiteEnglobante, exclureExistant, fusionnerMasqueBrut, masqueDessine, masqueFinal, masquePourApi } from "./masque";
import { recadrageAutour, tailleModele } from "./recadrage";
import { recoller } from "./recollage";
import { filtreDessin } from "./filtre-dessin";
import { masqueCouleur } from "./carte";

export interface UsageModele {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

/**
 * Appel d'édition au modèle d'image (fournisseur interchangeable). L'image à éditer
 * est la première ; les références de style suivent (le masque ne vaut que pour la première).
 */
export type Editeur = (
  consigne: string,
  imagePng: Buffer,
  options: { masquePng?: Buffer; taille: string; references?: Buffer[] },
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
  consigne: string;
  references?: Buffer[];
  /** Emprise de l'existant (volumes et disques au sol) : exclue du masque. */
  existant?: Masque | null;
}): Promise<ResultatRendu> {
  const { photo, editer } = params;
  const couche = await alignerSurPhoto(photo, params.couche);
  const masqueScene = await redimensionnerMasque(params.masqueScene, photo.largeur, photo.hauteur);
  const existant = params.existant ? await redimensionnerMasque(params.existant, photo.largeur, photo.hauteur) : null;

  const brut = fusionnerMasqueBrut(masqueScene, couche);
  const masque = exclureExistant(masqueFinal(brut), brut, existant);
  const boite = boiteEnglobante(masque);
  if (!boite) throw new Error("Aucun végétal ni massif visible dans cette vue.");

  const rect = recadrageAutour(boite, photo.largeur, photo.hauteur);
  const taille = tailleModele(rect.largeur, rect.hauteur);

  const vue = superposer(photo, couche);
  const imageEnvoi = await redimensionner(extraireRect(vue, rect), taille.largeur, taille.hauteur);
  const masqueEnvoi = await redimensionnerMasque(extraireRectMasque(masque, rect), taille.largeur, taille.hauteur);

  const reponse = await editer(params.consigne, await encoderPng(imageEnvoi), {
    masquePng: await encoderPng(masquePourApi(masqueEnvoi)),
    taille: `${taille.largeur}x${taille.hauteur}`,
    references: params.references,
  });

  const resultat = await redimensionner(await decoder(reponse.buffer), rect.largeur, rect.hauteur);
  return { image: recoller(photo, resultat, rect, masque), masque, usage: reponse.usage, rect, taille };
}

/** Dessin sans IA : filtre graphique sur la vue complète (photo + végétaux). */
export async function rendreDessinFiltre(params: { photo: ImageRGBA; couche: ImageRGBA }): Promise<ResultatRendu> {
  const couche = await alignerSurPhoto(params.photo, params.couche);
  return { image: filtreDessin(superposer(params.photo, couche)), masque: null, usage: null };
}

/** Style dessiné (croquis, aquarelle, feutres) : stylisation de toute la vue, éléments et positions conservés. */
export async function rendreDessinIA(params: {
  photo: ImageRGBA; couche: ImageRGBA; editer: Editeur; consigne: string; references?: Buffer[];
}): Promise<ResultatRendu> {
  const { photo, editer } = params;
  const couche = await alignerSurPhoto(photo, params.couche);
  const vue = superposer(photo, couche);
  const taille = tailleModele(photo.largeur, photo.hauteur);
  const envoi = await redimensionner(vue, taille.largeur, taille.hauteur);
  const reponse = await editer(params.consigne, await encoderPng(envoi), {
    taille: `${taille.largeur}x${taille.hauteur}`,
    references: params.references,
  });
  const image = await redimensionner(await decoder(reponse.buffer), photo.largeur, photo.hauteur);
  return { image, masque: null, usage: reponse.usage, taille };
}

/**
 * Passes par matériau : après le rendu principal, chaque matériau est repris dans une
 * édition masquée limitée à sa zone de la carte (élargie de 2 px, fondu de 3 px). Hors
 * de cette zone, l'image est inchangée au pixel près.
 */
export async function passesParMateriau(params: {
  image: ImageRGBA;
  carte: ImageRGBA;
  materiaux: { nom: string; description: string; rgb: [number, number, number] }[];
  consigne: (m: { nom: string; description: string }) => string;
  editer: Editeur;
  references?: Buffer[];
}): Promise<{ image: ImageRGBA; usages: UsageModele[] }> {
  let image = params.image;
  const carte = await redimensionner(params.carte, image.largeur, image.hauteur);
  const usages: UsageModele[] = [];
  for (const m of params.materiaux) {
    const masque = masqueFinal(masqueCouleur(carte, m.rgb), 2, 3);
    const boite = boiteEnglobante(masque);
    if (!boite) continue;
    const rect = recadrageAutour(boite, image.largeur, image.hauteur);
    const taille = tailleModele(rect.largeur, rect.hauteur);
    const envoi = await redimensionner(extraireRect(image, rect), taille.largeur, taille.hauteur);
    const masqueEnvoi = await redimensionnerMasque(extraireRectMasque(masque, rect), taille.largeur, taille.hauteur);
    const reponse = await params.editer(params.consigne(m), await encoderPng(envoi), {
      masquePng: await encoderPng(masquePourApi(masqueEnvoi)),
      taille: `${taille.largeur}x${taille.hauteur}`,
      references: params.references,
    });
    usages.push(reponse.usage);
    const resultat = await redimensionner(await decoder(reponse.buffer), rect.largeur, rect.hauteur);
    image = recoller(image, resultat, rect, masque);
  }
  return { image, usages };
}

/**
 * Base stylisée : la photo d'origine seule (sans le projet) redessinée dans le style, avec
 * les références de style, à la taille de la photo. Générée une fois, puis réutilisée.
 */
export async function genererBase(params: { photo: ImageRGBA; editer: Editeur; consigne: string; references?: Buffer[] }): Promise<{ image: ImageRGBA; usage: UsageModele }> {
  const { photo } = params;
  const taille = tailleModele(photo.largeur, photo.hauteur);
  const envoi = await redimensionner(photo, taille.largeur, taille.hauteur);
  const reponse = await params.editer(params.consigne, await encoderPng(envoi), {
    taille: `${taille.largeur}x${taille.hauteur}`,
    references: params.references,
  });
  return { image: await redimensionner(await decoder(reponse.buffer), photo.largeur, photo.hauteur), usage: reponse.usage };
}

/**
 * Projet ajouté sur la base stylisée par une édition masquée : la couche 3D (plantes et
 * matériaux) est superposée à la base dans le masque, la zone est redessinée dans le style
 * de la base, puis recollée : hors du masque, chaque pixel est celui de la base.
 */
export async function rendreSurBase(params: {
  base: ImageRGBA;
  couche: ImageRGBA;
  existant: Masque | null;
  editer: Editeur;
  consigne: string;
  references?: Buffer[];
}): Promise<ResultatRendu> {
  const { base, editer } = params;
  const couche = await alignerSurPhoto(base, params.couche);
  const existant = params.existant ? await redimensionnerMasque(params.existant, base.largeur, base.hauteur) : null;
  const masque = masqueDessine(couche, existant);
  const boite = boiteEnglobante(masque);
  if (!boite) throw new Error("Aucun végétal ni matériau visible dans cette vue.");

  const rect = recadrageAutour(boite, base.largeur, base.hauteur);
  const taille = tailleModele(rect.largeur, rect.hauteur);
  const vue = superposer(base, couche);
  const imageEnvoi = await redimensionner(extraireRect(vue, rect), taille.largeur, taille.hauteur);
  const masqueEnvoi = await redimensionnerMasque(extraireRectMasque(masque, rect), taille.largeur, taille.hauteur);
  const reponse = await editer(params.consigne, await encoderPng(imageEnvoi), {
    masquePng: await encoderPng(masquePourApi(masqueEnvoi)),
    taille: `${taille.largeur}x${taille.hauteur}`,
    references: params.references,
  });
  const resultat = await redimensionner(await decoder(reponse.buffer), rect.largeur, rect.hauteur);
  return { image: recoller(base, resultat, rect, masque), masque, usage: reponse.usage, rect, taille };
}
