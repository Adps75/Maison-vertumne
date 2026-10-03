/**
 * Style fixe pour la génération de plantes.
 * Appliqué à toutes les plantes pour une signature cohérente.
 * PAS de mention du fond dans le prompt (géré par le paramètre background de l'API).
 */

export const STYLE_PLANTE = {
  base: [
    "Realistic botanical illustration",
    "Single whole plant, no pot, no decoration, no ground shadow",
    "Soft and uniform natural lighting",
    "Clean and precise rendering, slightly painterly style",
    "Faithfully represent the indicated species: accurate leaf shape and size, natural growth habit, realistic flower color and size",
    "If in doubt about flowering, show the plant without flowers",
  ].join(". ") + ".",

  face: "Full side view at eye level. The base of the plant rests on the bottom edge of the image. The plant is centered horizontally. Show the entire plant from root crown to top.",

  dessus: "Strictly vertical top-down orthogonal view of the plant canopy. Centered in the frame.",

  formeBoule: "The plant is pruned into a regular sphere shape, with dense and compact foliage forming a perfectly round ball.",

  referenceInstruction:
    "Match exactly the same rendering style, color palette, lighting and level of detail as the reference image. Do not copy the plant species — only reproduce the artistic style.",
} as const;

/** Tarifs OpenAI pour le calcul du coût réel (par million de tokens). */
export const TARIFS_IMAGE = {
  input_text_par_mt: 5.0,
  input_image_par_mt: 8.0,
  output_par_mt: 30.0,
} as const;

/** Calcule le coût réel en euros à partir des tokens consommés. */
export function calculerCout(usage: {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}): number {
  const textTokens = usage.input_tokens_details?.text_tokens ?? usage.input_tokens;
  const imageTokens = usage.input_tokens_details?.image_tokens ?? 0;

  const coutInput =
    (textTokens / 1_000_000) * TARIFS_IMAGE.input_text_par_mt +
    (imageTokens / 1_000_000) * TARIFS_IMAGE.input_image_par_mt;
  const coutOutput =
    (usage.output_tokens / 1_000_000) * TARIFS_IMAGE.output_par_mt;

  // Conversion USD → EUR approximative
  return Math.round((coutInput + coutOutput) * 0.92 * 10000) / 10000;
}
