import "server-only";

import sharp from "sharp";
import type { FournisseurImage, OptionsGeneration, ResultatGeneration } from "./types";

/** Consommation fictive renvoyée par le fournisseur simulé. */
export const USAGE_SIMULE = {
  input_tokens: 1200,
  output_tokens: 4000,
  input_tokens_details: { text_tokens: 200, image_tokens: 1000 },
};

/**
 * Fournisseur d'image simulé (FOURNISSEUR_IMAGE=simule), pour les tests :
 * aucun appel réseau. L'édition renvoie l'image reçue, couleurs inversées,
 * à la taille demandée : le résultat est déterministe et visiblement différent.
 */
export class FournisseurSimule implements FournisseurImage {
  async generer(_prompt: string, options?: OptionsGeneration): Promise<ResultatGeneration> {
    const [l, h] = (options?.taille ?? "1024x1024").split("x").map(Number);
    const buffer = await sharp({ create: { width: l, height: h, channels: 4, background: { r: 120, g: 160, b: 90, alpha: 1 } } })
      .png().toBuffer();
    return { buffer, usage: USAGE_SIMULE };
  }

  async editer(_prompt: string, imageReference: Buffer, options?: OptionsGeneration): Promise<ResultatGeneration> {
    const [l, h] = (options?.taille ?? "1024x1024").split("x").map(Number);
    const buffer = await sharp(imageReference).resize(l, h, { fit: "fill" }).negate({ alpha: false }).png().toBuffer();
    return { buffer, usage: USAGE_SIMULE };
  }
}
