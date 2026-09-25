import "server-only";

import sharp from "sharp";
import {
  bboxGeometrie3857,
  versPixel,
  type BBox3857,
} from "./projection";
import {
  recupererImageWms,
  TAILLE_IMAGE,
  MARGE_IMAGE,
} from "./aerienne";
import type { SupabaseClient } from "@supabase/supabase-js";

const LAITON = "#9C7C3C";
const LAITON_FILL = "rgba(156,124,60,0.15)";
const TAILLE = TAILLE_IMAGE;

interface PhotoPourAnnotation {
  ordre: number;
  lat: number | null;
  lon: number | null;
  orientation_degres: number | null;
}

/**
 * Génère l'image aérienne annotée (contour parcelle, marqueurs, flèches)
 * et l'image infrarouge. Les stocke dans Storage.
 * Renvoie les deux buffers.
 */
export async function preparerImagesAeriennes(
  supabase: SupabaseClient,
  leadId: string,
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
  photos: PhotoPourAnnotation[],
): Promise<{ aerienneAnnotee: Buffer; infrarouge: Buffer }> {
  const bbox = bboxGeometrie3857(geometry, MARGE_IMAGE);

  // Récupérer les deux images en parallèle
  const [aerienneBuffer, infrarougeBuffer] = await Promise.all([
    recupererImageWms(bbox, "ORTHOIMAGERY.ORTHOPHOTOS"),
    recupererImageWms(bbox, "ORTHOIMAGERY.ORTHOPHOTOS.IRC"),
  ]);

  // Générer le SVG d'annotation
  const svg = genererSvgAnnotation(geometry, photos, bbox);

  // Composer l'image annotée
  const aerienneAnnotee = await sharp(aerienneBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();

  // Stocker l'image annotée dans Storage
  await supabase.storage
    .from("documents-leads")
    .upload(
      `leads/${leadId}/aerienne-annotee.jpg`,
      aerienneAnnotee,
      { contentType: "image/jpeg", upsert: true },
    );

  return { aerienneAnnotee, infrarouge: infrarougeBuffer };
}

/** Lit les photos client depuis Storage et les renvoie en base64. */
export async function lirePhotosClient(
  supabase: SupabaseClient,
  photoPaths: string[],
): Promise<{ ordre: number; base64: string }[]> {
  const resultats: { ordre: number; base64: string }[] = [];

  for (let i = 0; i < photoPaths.length; i++) {
    const { data, error } = await supabase.storage
      .from("photos-jardins")
      .download(photoPaths[i]);

    if (error || !data) continue;

    const buffer = Buffer.from(await data.arrayBuffer());
    resultats.push({
      ordre: i + 1,
      base64: buffer.toString("base64"),
    });
  }

  return resultats;
}

function genererSvgAnnotation(
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon,
  photos: PhotoPourAnnotation[],
  bbox: BBox3857,
): string {
  const elements: string[] = [];

  // Contour de la parcelle
  const rings =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat(1)
      : geometry.coordinates;

  for (const ring of rings) {
    const points = ring
      .map(([lon, lat]) => {
        const { px, py } = versPixel(lat, lon, bbox, TAILLE);
        return `${px},${py}`;
      })
      .join(" ");
    elements.push(
      `<polygon points="${points}" fill="${LAITON_FILL}" stroke="${LAITON}" stroke-width="3" stroke-dasharray="12 8"/>`,
    );
  }

  // Marqueurs et flèches pour chaque photo
  for (const photo of photos) {
    if (photo.lat == null || photo.lon == null) continue;

    const { px, py } = versPixel(photo.lat, photo.lon, bbox, TAILLE);

    // Marqueur numéroté
    elements.push(
      `<circle cx="${px}" cy="${py}" r="14" fill="${LAITON}"/>`,
      `<text x="${px}" y="${py}" text-anchor="middle" dy="5" font-size="14" font-weight="600" fill="#F2F0E9">${photo.ordre}</text>`,
    );

    // Flèche de direction
    if (photo.orientation_degres != null) {
      const dir = photo.orientation_degres;
      const len = TAILLE * 0.04; // longueur de la flèche en pixels
      const toRad = (d: number) => (d * Math.PI) / 180;
      // Direction : 0 = nord = -Y en pixels
      const endX = px + len * Math.sin(toRad(dir));
      const endY = py - len * Math.cos(toRad(dir));

      // Pointe de flèche
      const arrowLen = 8;
      const arrowAngle = 25;
      const a1x = endX - arrowLen * Math.sin(toRad(dir - arrowAngle));
      const a1y = endY + arrowLen * Math.cos(toRad(dir - arrowAngle));
      const a2x = endX - arrowLen * Math.sin(toRad(dir + arrowAngle));
      const a2y = endY + arrowLen * Math.cos(toRad(dir + arrowAngle));

      elements.push(
        `<line x1="${px}" y1="${py}" x2="${endX}" y2="${endY}" stroke="${LAITON}" stroke-width="2.5"/>`,
        `<polygon points="${endX},${endY} ${a1x},${a1y} ${a2x},${a2y}" fill="${LAITON}"/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TAILLE}" height="${TAILLE}">${elements.join("")}</svg>`;
}
