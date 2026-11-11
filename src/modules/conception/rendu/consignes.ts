/**
 * Consignes envoyées au modèle d'image pour les rendus de vue.
 */

/** Réaliste : intégration des végétaux dans le massif, rien d'autre. */
export const CONSIGNE_REALISTE = [
  "This is a real photograph of a garden in which new plants have been composited inside a planting bed.",
  "Edit ONLY the transparent (masked) area.",
  "Integrate the plants naturally into the photograph: match the photo's lighting, colour temperature, sharpness and grain;",
  "give each plant realistic soft shadows consistent with the sun, a believable contact with the ground,",
  "and bare soil or mulch at the foot of the plants inside the bed.",
  "Keep every plant exactly as it appears: same species, shape, size, colour, flowering and position. Do not replace, move, add or remove any plant.",
  "Do not add any object, person, animal, furniture, path, text or decoration.",
  "Do not change anything outside the planting bed: lawn, paving, walls, house, fences, sky and background must stay identical.",
  "Photorealistic result, no illustration style.",
].join(" ");

/** Dessin avec IA : stylisation de toute l'image, éléments et positions conservés. */
export const CONSIGNE_DESSIN_IA = [
  "Turn this garden photograph into a landscape architect's illustration: loose watercolour washes with fine ink linework, on warm off-white paper.",
  "Strictly keep every element of the image and its exact position, size and proportions: house, windows, roof, walls, fences, paths, lawn, every plant and tree, sky.",
  "Do not add, remove, move or reinterpret any element. Do not add text, people, animals or objects.",
  "Keep the same framing and perspective.",
].join(" ");

/** Mention affichée avec les rendus « Dessin avec IA ». */
export const MENTION_DESSIN_IA = "L'IA peut modifier certains détails";

/** Mention portée par chaque visuel téléchargé. */
export const MENTION_VISUEL = "Visuel d'ambiance non contractuel, végétaux à 2-3 ans";
