/**
 * Cache mémoire des images chargées pour les textures 3D.
 * Survit aux démontages du Canvas : les images restent en RAM
 * et n'ont pas besoin d'être retéléchargées à la réouverture.
 */

const images = new Map<string, HTMLImageElement>();

/** Stocke une référence à l'image pour empêcher le GC. */
export function garderImageEnCache(url: string, img: HTMLImageElement): void {
  if (!images.has(url)) {
    images.set(url, img);
  }
}
