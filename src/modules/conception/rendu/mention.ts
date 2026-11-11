/**
 * Mention portée par les visuels téléchargés (export du Visuel et rendus IA).
 */

import { MENTION_VISUEL } from "./consignes";

/** Dessine la mention en bas de l'image, sur un bandeau semi-transparent. */
export function dessinerMention(ctx: CanvasRenderingContext2D, largeur: number, hauteur: number): void {
  ctx.save();
  const taille = Math.max(12, largeur * 0.012);
  ctx.font = `${taille}px sans-serif`;
  const l = ctx.measureText(MENTION_VISUEL).width;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect((largeur - l) / 2 - 8, hauteur - taille - 16, l + 16, taille + 12);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(MENTION_VISUEL, (largeur - l) / 2, hauteur - 12);
  ctx.restore();
}

/** Télécharge un canvas en PNG. */
export function telechargerCanvas(canvas: HTMLCanvasElement, nomFichier: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Export PNG impossible")); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomFichier;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
