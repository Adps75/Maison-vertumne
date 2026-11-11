import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Rendus IA : partie légère (chemins, schémas, accès au point de vue, suppression).
 * Volontairement sans sharp ni fournisseur d'image, pour ne pas alourdir les routes
 * qui n'en ont pas besoin (la génération est dans ./rendus.ts).
 */

export const BUCKET = "conception";

export const STYLES_RENDU = ["realiste", "dessin_filtre", "dessin_ia"] as const;
export type StyleRendu = (typeof STYLES_RENDU)[number];

export const schemaPreparation = z.object({ style: z.enum(STYLES_RENDU) });
export const schemaGeneration = z.object({ renduId: z.uuid(), style: z.enum(STYLES_RENDU) });

/** Chemins de stockage d'un rendu (dérivés de l'id, jamais fournis par le client). */
export function cheminsRendu(projetId: string, renduId: string) {
  const base = `projets/${projetId}/rendus/${renduId}`;
  return {
    couche: `${base}/couche.png`,
    masqueScene: `${base}/masque-scene.png`,
    image: `${base}/image.png`,
    masque: `${base}/masque.png`,
  };
}

export interface LigneRendu {
  id: string;
  point_de_vue_id: string;
  style: StyleRendu;
  image_path: string;
  masque_path: string | null;
  cout: number;
  created_at: string;
}

/** Vérifie que le point de vue appartient au projet ; renvoie sa photo. */
export async function chargerPointDeVue(supabase: SupabaseClient, projetId: string, pdvId: string) {
  const { data } = await supabase
    .from("conception_points_de_vue")
    .select("id, photo_path, largeur_px, hauteur_px")
    .eq("id", pdvId)
    .eq("projet_id", projetId)
    .single();
  return data as { id: string; photo_path: string; largeur_px: number; hauteur_px: number } | null;
}

/** Supprime les fichiers de stockage de rendus. */
export async function supprimerFichiersRendus(supabase: SupabaseClient, rendus: Pick<LigneRendu, "image_path" | "masque_path">[]) {
  const chemins = rendus.flatMap((r) => [r.image_path, r.masque_path].filter((p): p is string => !!p));
  if (chemins.length > 0) await supabase.storage.from(BUCKET).remove(chemins);
}
