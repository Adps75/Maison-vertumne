import "server-only";

/**
 * Textures des matériaux (serveur) : rendre une image répétable sans couture, et la
 * consigne de génération par le modèle d'image.
 */

import sharp from "sharp";
import type { Materiau } from "./materiaux";

export const TAILLE_TEXTURE = 1024;

/**
 * Rend une texture répétable : l'image décalée d'une demi-taille (dont les bords se
 * raccordent par construction) est fondue sur les bords de l'image d'origine, qui garde
 * son centre. Les bords opposés du résultat sont identiques : aucune couture en mosaïque.
 */
export async function rendreRepetable(buffer: Buffer, taille = TAILLE_TEXTURE): Promise<Buffer> {
  const { data } = await sharp(buffer).rotate().resize(taille, taille, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = taille, demi = n / 2;
  const sortie = Buffer.alloc(n * n * 3);
  const lisse = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Poids de l'original : 1 au centre, 0 sur les bords
      const wx = 1 - Math.abs((x + 0.5) / n * 2 - 1);
      const wy = 1 - Math.abs((y + 0.5) / n * 2 - 1);
      const w = lisse(Math.min(1, Math.min(wx, wy) * 2.2));
      const i = (y * n + x) * 3;
      const j = (((y + demi) % n) * n + ((x + demi) % n)) * 3;
      for (let c = 0; c < 3; c++) sortie[i + c] = Math.round(data[i + c] * w + data[j + c] * (1 - w));
    }
  }
  return sharp(sortie, { raw: { width: n, height: n, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
}

/** Consigne de génération d'une texture vue du dessus, à l'échelle réelle. */
export function consigneTexture(m: Pick<Materiau, "description_ia" | "texture_taille_m">): string {
  const taille = m.texture_taille_m ?? 0.5;
  return [
    "Seamless, tileable ground texture photographed straight down (top-down, orthographic view, no perspective, no horizon).",
    "Even, soft overcast daylight; no cast shadows, no vignetting, no objects, no plants, no edges or borders: the material fills the whole frame uniformly.",
    `The image covers a real area of ${String(taille)} m × ${String(taille)} m.`,
    `Material (described in French): ${m.description_ia}.`,
  ].join(" ");
}
