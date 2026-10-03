import "server-only";

import sharp from "sharp";

/**
 * Normalise la vue de face :
 * - supprime les marges transparentes
 * - la base de la plante touche le bas de l'image
 * - centrée horizontalement
 * Renvoie le buffer PNG + le rapport largeur/hauteur réel.
 */
export async function normaliserFace(buffer: Buffer): Promise<{
  buffer: Buffer;
  ratioLargeurHauteur: number;
}> {
  // Trim les marges transparentes
  const trimmed = await sharp(buffer)
    .trim()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;

  // Ajouter une marge de 2 % en haut et sur les côtés, la base touche le bas
  const margePct = 0.02;
  const margeH = Math.round(width * margePct);
  const margeV = Math.round(height * margePct);

  const finalWidth = width + margeH * 2;
  const finalHeight = height + margeV;

  const result = await sharp({
    create: {
      width: finalWidth,
      height: finalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: trimmed.data,
        left: margeH,
        top: 0, // Plante collée en haut après trim → la base est en bas
      },
    ])
    .png()
    .toBuffer();

  return {
    buffer: result,
    ratioLargeurHauteur: width / height,
  };
}

/**
 * Normalise la vue de dessus :
 * - supprime les marges transparentes
 * - inscrit dans un carré, centrée
 * Renvoie le buffer PNG carré.
 */
export async function normaliserDessus(buffer: Buffer): Promise<Buffer> {
  const trimmed = await sharp(buffer)
    .trim()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;
  const cote = Math.max(width, height);

  // Marge de 5 %
  const marge = Math.round(cote * 0.05);
  const finalCote = cote + marge * 2;

  const offsetX = Math.round((finalCote - width) / 2);
  const offsetY = Math.round((finalCote - height) / 2);

  return sharp({
    create: {
      width: finalCote,
      height: finalCote,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed.data, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
}

/**
 * Génère un symbole de plan simple (vue de dessus) avec sharp.
 * Disque irrégulier dans la couleur du feuillage, dégradé léger.
 */
export async function genererSymbolePlan(
  couleurFeuillage: string,
  taillePx: number = 512,
): Promise<Buffer> {
  // Parse hex color
  const hex = couleurFeuillage.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 60;
  const g = parseInt(hex.substring(2, 4), 16) || 120;
  const b = parseInt(hex.substring(4, 6), 16) || 60;

  const centre = taillePx / 2;
  const rayon = taillePx * 0.42;

  // SVG avec disque irrégulier
  const points: string[] = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    const variation = 0.85 + Math.random() * 0.3; // Bord irrégulier
    const px = centre + rayon * variation * Math.cos(angle);
    const py = centre + rayon * variation * Math.sin(angle);
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${taillePx}" height="${taillePx}">
    <defs>
      <radialGradient id="g" cx="40%" cy="40%">
        <stop offset="0%" stop-color="rgb(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 20)})" />
        <stop offset="100%" stop-color="rgb(${Math.max(0, r - 30)},${Math.max(0, g - 20)},${Math.max(0, b - 10)})" />
      </radialGradient>
    </defs>
    <polygon points="${points.join(" ")}" fill="url(#g)" stroke="rgb(${Math.max(0, r - 50)},${Math.max(0, g - 40)},${Math.max(0, b - 30)})" stroke-width="2" />
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
