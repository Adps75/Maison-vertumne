/**
 * Styles prédéfinis du rendu IA et assemblage de la consigne — fonctions pures.
 *
 * Chaque style est défini par une consigne (ici) et 1 à 3 images de référence
 * communes à l'atelier (table conception_styles_references). Le style du projet est le
 * même pour toutes ses vues : la partie « style » de la consigne et les références sont
 * identiques d'une vue à l'autre ; seules changent les parties propres à la vue
 * (matériaux visibles et leur position, plantes annotées).
 */

import type { MateriauDecrit } from "../materiaux/materiaux";

export const STYLES = ["croquis", "aquarelle", "feutres", "realiste"] as const;
export type StyleProjet = (typeof STYLES)[number];
/** Styles des anciens rendus (toujours affichés). */
export type StyleHistorique = StyleProjet | "dessin_filtre" | "dessin_ia";

export const STYLE_DEFAUT: StyleProjet = "croquis";
export const MAX_REFERENCES = 3;

export const LIBELLES_STYLES: Record<StyleHistorique, string> = {
  croquis: "Croquis d'architecte paysagiste",
  aquarelle: "Aquarelle",
  feutres: "Feutres",
  realiste: "Réaliste",
  dessin_filtre: "Dessin (filtre)",
  dessin_ia: "Aquarelle",
};

export const DESCRIPTIONS_STYLES: Record<StyleProjet, string> = {
  croquis: "Trait d'encre fin, lavis d'aquarelle légers, couleurs désaturées, beaucoup de papier blanc. Premier plan détaillé, fond estompé.",
  aquarelle: "Lavis d'aquarelle et trait d'encre sur papier crème, toute la vue stylisée.",
  feutres: "Rendu concours : couleurs franches au feutre, contours marqués.",
  realiste: "Photo conservée : seuls le massif et les matériaux du projet sont retouchés.",
};

/** Le style est-il dessiné (toute la vue stylisée) ou réaliste (masque) ? */
export const estDessine = (s: StyleProjet) => s !== "realiste";

/** Mention affichée avec les rendus dessinés par l'IA. */
export const MENTION_DESSIN_IA = "L'IA peut modifier certains détails";

const FIDELITE = [
  "Strictly keep every element of the scene and its exact position, size and proportions: house, windows, roof, walls, fences, paths, lawn, every plant and tree, sky.",
  "Do not add, remove, move or reinterpret any element. Do not add people, animals or objects.",
  "Keep the same framing and perspective.",
].join(" ");

/** Consigne propre à chaque style (identique pour toutes les vues d'un projet). */
const CONSIGNES_STYLES: Record<StyleProjet, string> = {
  croquis: [
    "Turn this garden photograph into a landscape architect's sketch.",
    "Fine, precise ink linework drawn with a black or sepia felt-tip pen; light, transparent watercolour washes; desaturated colours;",
    "lots of untouched white paper left in reserve.",
    "Draw the foreground and the planting project in detail; simplify and fade the background; barely sketch the sky;",
    "render shadows with light hatching.",
    FIDELITE,
  ].join(" "),
  aquarelle: [
    "Turn this garden photograph into a landscape architect's illustration: loose watercolour washes with fine ink linework, on warm off-white paper.",
    FIDELITE,
  ].join(" "),
  feutres: [
    "Turn this garden photograph into a competition-style marker rendering:",
    "bold, saturated marker colours laid in confident strokes, strong dark outlines, crisp contrast, white highlights, a slightly graphic finish.",
    FIDELITE,
  ].join(" "),
  realiste: [
    "This is a real photograph of a garden in which new plants have been composited inside a planting bed.",
    "Edit ONLY the transparent (masked) area.",
    "Integrate the plants naturally into the photograph: match the photo's lighting, colour temperature, sharpness and grain;",
    "give each plant realistic soft shadows consistent with the sun, a believable contact with the ground,",
    "and bare soil or mulch at the foot of the plants inside the bed, unless a mulch material is specified below.",
    "Keep every plant exactly as it appears: same species, shape, size, colour, flowering and position. Do not replace, move, add or remove any plant.",
    "Do not add any object, person, animal, furniture, path, text or decoration.",
    "Do not change anything outside the transparent area: everything else must stay identical.",
    "Photorealistic result, no illustration style.",
  ].join(" "),
};

const consigneReferences = (n: number) => [
  "The first image is the scene to transform.",
  `The LAST ${n === 1 ? "image is a STYLE REFERENCE" : `${n} images are STYLE REFERENCES`} ONLY: reproduce their drawing technique, line quality, colour palette, paper and texture,`,
  "but do NOT copy their content, composition, buildings, plants or any object from them.",
].join(" ");

const consigneReferencesRealiste = (n: number) => [
  "The first image is the photograph to edit.",
  `The LAST ${n === 1 ? "image is a reference" : `${n} images are references`} for the rendering quality and atmosphere only: do NOT copy their content or any object from them.`,
].join(" ");

/**
 * Partie « style » de la consigne : identique pour toutes les vues du projet (elle ne
 * dépend ni de la carte des matériaux ni du contenu de la vue).
 */
export function consigneStyle(style: StyleProjet, nbReferences: number): string {
  const refs = nbReferences > 0 ? ` ${style === "realiste" ? consigneReferencesRealiste(nbReferences) : consigneReferences(nbReferences)}` : "";
  return `${CONSIGNES_STYLES[style]}${refs}`;
}

/** Base stylisée : la photo seule redessinée, sans rien ajouter (le projet viendra ensuite). */
export function consigneBase(style: Exclude<StyleProjet, "realiste">, nbReferences: number): string {
  return `${consigneStyle(style, nbReferences)}\n\nDraw ONLY what is in the photograph: do not add, remove or change any element — no new plants, no planting bed, no mulch, no edging, no text.`;
}

const STYLES_EN: Record<Exclude<StyleProjet, "realiste">, string> = {
  croquis: "a landscape architect's sketch: fine ink linework, light transparent watercolour washes, desaturated colours, white paper in reserve",
  aquarelle: "a landscape architect's illustration: loose watercolour washes with fine ink linework on warm off-white paper",
  feutres: "a competition-style marker rendering: bold saturated marker colours, strong dark outlines",
};

/**
 * Édition masquée sur la base stylisée : le projet (plantes, matériaux, bordures) a été
 * superposé dans la zone transparente ; le modèle le redessine dans le style de l'image,
 * sans rien déplacer. Hors de cette zone, l'image est recollée telle quelle.
 */
export function consigneEditionBase(o: Omit<OptionsConsigne, "style"> & { style: Exclude<StyleProjet, "realiste"> }): string {
  const n = o.nbReferences;
  const parties = [[
    `The first image is a drawing in a precise style (${STYLES_EN[o.style]}).`,
    "New project elements (plants, ground materials such as mulch or lawn, edging) have been pasted into it as 3D renderings inside the transparent (masked) area.",
    "Edit ONLY the transparent area: redraw these elements in exactly the same drawing style as the surrounding image (same linework, colours, paper and technique),",
    "keeping each plant, each material and each edging exactly at its place, with its size, shape and colour. Blend the edges of the area seamlessly into the surrounding drawing.",
    "Do not add, remove or move anything.",
    n > 0 ? `The LAST ${n === 1 ? "image is a STYLE REFERENCE" : `${n} images are STYLE REFERENCES`} ONLY: do NOT copy their content.` : "",
  ].filter(Boolean).join(" ")];
  if (o.materiaux.length > 0) {
    parties.push(`Materials shown in the area (descriptions in French):\n${[...new Map(o.materiaux.map((m) => [m.nom, m])).values()].map((m) => `- ${m.nom} : ${m.description}`).join("\n")}`);
  }
  if (o.annotations && o.style === "croquis" && o.plantesPrincipales.length > 0) {
    parties.push(`Add handwritten labels in French, with thin hand-drawn arrows pointing to the corresponding plants: ${o.plantesPrincipales.map((p) => `« ${p} »`).join(", ")}. Write only these names, spelled exactly as given.`);
  } else {
    parties.push("Do not add any text, label or lettering.");
  }
  const sup = o.consignesSup.trim();
  if (sup) parties.push(`Additional instructions from the landscape architect (ambience, season, light; they never change the design, the plants or their positions): « ${sup} »`);
  return parties.join("\n\n");
}

/** Consigne d'une passe limitée à la zone d'un matériau (masque). */
export function consignePasse(style: StyleProjet, m: { nom: string; description: string }): string {
  const rendu = style === "realiste" ? "photorealistic, matching the photograph's lighting, colour and grain" : "in exactly the same drawing style as the rest of the image";
  return [
    `Edit ONLY the transparent (masked) area: it is exactly the area of the material « ${m.nom} » (${m.description}).`,
    `Fill that whole area with this material, ${rendu}, following the perspective of the ground.`,
    "Keep its edges exactly; do not draw it outside the transparent area; do not change, add or remove anything else, and keep the plants standing in the area.",
  ].join(" ");
}

export interface OptionsConsigne {
  style: StyleProjet;
  nbReferences: number;
  /** Croquis : noms des plantes principales écrits à la main, avec une flèche. */
  annotations: boolean;
  /** Plantes principales visibles dans la vue (pour les annotations). */
  plantesPrincipales: string[];
  /** Matériaux du projet visibles dans la vue (nom et description, jamais de position). */
  materiaux: MateriauDecrit[];
  /** Consignes supplémentaires du paysagiste (ambiance, saison, lumière). */
  consignesSup: string;
}

const UNITES = { m2: "m²", ml: "ml" } as const;

/** Ligne de matériau sans position : la limite d'un matériau n'est jamais décrite en mots. */
function ligneMateriau(m: MateriauDecrit): string {
  return `- ${m.nom} (${String(m.quantite).replace(".", ",")} ${UNITES[m.unite]}) : ${m.description}`;
}

/** Consigne complète d'un rendu : style, matériaux, annotations, consignes supplémentaires. */
export function consigneRendu(o: OptionsConsigne): string {
  const parties = [consigneStyle(o.style, o.nbReferences)];
  if (o.materiaux.length > 0) {
    parties.push(o.style === "realiste"
      ? `Inside the transparent area, also render these project materials, exactly where they are in the image (descriptions in French):\n${o.materiaux.map(ligneMateriau).join("\n")}`
      : `The project also includes these materials, to be drawn clearly where they are in the image (descriptions in French):\n${o.materiaux.map(ligneMateriau).join("\n")}`);
  }
  if (o.annotations && o.style === "croquis" && o.plantesPrincipales.length > 0) {
    parties.push(`Add handwritten labels in French, with thin hand-drawn arrows pointing to the corresponding plants: ${o.plantesPrincipales.map((p) => `« ${p} »`).join(", ")}. Write only these names, spelled exactly as given, in a neat architect's hand.`);
  } else {
    parties.push("Do not add any text, label or lettering.");
  }
  const sup = o.consignesSup.trim();
  if (sup) {
    parties.push(`Additional instructions from the landscape architect (ambience, season, light; they never change the design, the plants or their positions): « ${sup} »`);
  }
  return parties.join("\n\n");
}

/** Plantes principales visibles : les plus nombreuses dans la vue (5 au plus). */
export function plantesPrincipales(noms: string[], max = 5): string[] {
  const compte = new Map<string, number>();
  for (const n of noms) if (n.trim()) compte.set(n.trim(), (compte.get(n.trim()) ?? 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, max)
    .map(([n]) => n);
}
