import { z } from "zod";

// Format exact : leads/{uuid}/{uuid}.jpg — aucun autre segment
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHEMIN_REGEX = new RegExp(`^leads/${UUID}/${UUID}\\.jpg$`);

/** Vérifie qu'un chemin Storage appartient bien au lead donné. */
export function cheminAppartientAuLead(path: string, leadId: string): boolean {
  if (!CHEMIN_REGEX.test(path)) return false;
  // Le deuxième segment doit être exactement le leadId
  const segments = path.split("/");
  return segments[1] === leadId;
}

/** Schéma pour l'enregistrement d'une photo. */
export const schemaPhotoEnregistrement = z.object({
  path: z.string().regex(CHEMIN_REGEX, "Chemin de fichier invalide."),
  ordre: z.number().int().min(1).max(4),
  lat: z.number().optional(),
  lon: z.number().optional(),
  orientation_degres: z.number().min(0).max(360).optional(),
  legende: z.string().max(80).optional(),
});

/** Schéma pour la mise à jour de position/légende d'une photo. */
export const schemaPhotoPatch = z
  .object({
    lat: z.number().optional(),
    lon: z.number().optional(),
    orientation_degres: z.number().min(0).max(360).optional(),
    legende: z.string().max(80).optional(),
  })
  .strict();

export const MAX_PHOTOS = 4;
export const MIN_PHOTOS = 3;
