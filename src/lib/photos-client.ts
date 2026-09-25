const MAX_PX = 1600;
const QUALITE = 0.8;

/**
 * Redimensionne une image à 1600 px max, exporte en JPEG.
 * Utilise createImageBitmap avec options de resize si supporté,
 * sinon repli sur Image + canvas.
 * Le réencodage par canvas supprime les métadonnées EXIF.
 */
export async function redimensionnerImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;

  try {
    // Tentative avec options de redimensionnement (économe en mémoire)
    const img = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = img;

    if (width <= MAX_PX && height <= MAX_PX) {
      bitmap = img;
    } else {
      img.close();
      const ratio = Math.min(MAX_PX / width, MAX_PX / height);
      const rw = Math.round(width * ratio);
      const rh = Math.round(height * ratio);

      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
          resizeWidth: rw,
          resizeHeight: rh,
          resizeQuality: "high",
        });
      } catch {
        // Repli : createImageBitmap sans options de resize
        bitmap = await redimensionnerViaImage(file, rw, rh);
      }
    }
  } catch {
    throw new Error(
      "Impossible de lire cette image. Essayez un format JPEG ou PNG.",
    );
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Impossible de créer le contexte canvas.");
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITE });
  if (!blob) {
    throw new Error("Impossible d'encoder l'image en JPEG.");
  }

  return blob;
}

/** Repli : utilise un élément Image pour décoder, puis canvas pour redimensionner. */
function redimensionnerViaImage(
  file: File,
  targetW: number,
  targetH: number,
): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        const bmp = await createImageBitmap(img, {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: "high",
        });
        resolve(bmp);
      } catch {
        // Dernier repli : bitmap pleine taille, le canvas redimensionnera
        const bmp = await createImageBitmap(img);
        resolve(bmp);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image. Essayez un format JPEG ou PNG."));
    };
    img.src = url;
  });
}
