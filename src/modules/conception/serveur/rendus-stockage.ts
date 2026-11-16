import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STYLES, MAX_REFERENCES, type StyleProjet, type StyleHistorique } from "../rendu/styles";

/**
 * Rendus IA : partie légère (chemins, schémas, accès au point de vue, suppression).
 * Volontairement sans sharp ni fournisseur d'image, pour ne pas alourdir les routes
 * qui n'en ont pas besoin (la génération est dans ./rendus.ts).
 */

export const BUCKET = "conception";

/** Styles proposés (les anciens rendus « dessin_filtre » et « dessin_ia » restent listés). */
export const STYLES_RENDU = STYLES;
export type StyleRendu = StyleProjet;

export const schemaPreparation = z.object({ style: z.enum(STYLES) });

/** Contexte propre à la vue, calculé par le navigateur (projection de la caméra calée). */
const schemaMateriauDecrit = z.object({
  nom: z.string().min(1).max(120),
  description: z.string().max(600),
  quantite: z.number().min(0).max(100000),
  unite: z.enum(["m2", "ml"]),
  position: z.string().max(120),
});

export const schemaGeneration = z.object({
  renduId: z.uuid(),
  style: z.enum(STYLES),
  annotations: z.boolean().default(false),
  consignesSup: z.string().max(500).default(""),
  materiaux: z.array(schemaMateriauDecrit).max(40).default([]),
  plantesPrincipales: z.array(z.string().min(1).max(80)).max(5).default([]),
  /** Une passe masquée par matériau après le rendu principal (option, coût en plus). */
  passesMateriaux: z.boolean().default(false),
});
export type DemandeGeneration = z.infer<typeof schemaGeneration>;

/** Chemin de stockage d'une image de référence de style. */
export function cheminReference(style: StyleProjet, id: string) {
  return `styles/${style}/${id}.png`;
}

export interface ReferenceStyle {
  id: string;
  style: StyleProjet;
  path: string;
  actif: boolean;
  created_at: string;
}

/** Références actives d'un style (les plus anciennes d'abord, MAX_REFERENCES au plus). */
export async function referencesActives(supabase: SupabaseClient, style: StyleProjet): Promise<ReferenceStyle[]> {
  const { data } = await supabase
    .from("conception_styles_references")
    .select("id, style, path, actif, created_at")
    .eq("style", style)
    .eq("actif", true)
    .order("created_at")
    .limit(MAX_REFERENCES);
  return (data ?? []) as ReferenceStyle[];
}

/** Chemins de stockage d'un rendu (dérivés de l'id, jamais fournis par le client). */
export function cheminsRendu(projetId: string, renduId: string) {
  const base = `projets/${projetId}/rendus/${renduId}`;
  return {
    couche: `${base}/couche.png`,
    masqueScene: `${base}/masque-scene.png`,
    image: `${base}/image.png`,
    masque: `${base}/masque.png`,
    /** Carte des matériaux : envoyée au modèle, conservée avec le rendu (trace). */
    carte: `${base}/carte.png`,
  };
}

export interface LigneRendu {
  id: string;
  point_de_vue_id: string;
  style: StyleHistorique;
  image_path: string;
  masque_path: string | null;
  cout: number;
  created_at: string;
  consigne?: string | null;
  consigne_style?: string | null;
  references_utilisees?: { id: string; path: string }[];
  consignes_sup?: string | null;
  annotations?: boolean;
  carte_path?: string | null;
  passes_materiaux?: number;
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
export async function supprimerFichiersRendus(supabase: SupabaseClient, rendus: Pick<LigneRendu, "image_path" | "masque_path" | "carte_path">[]) {
  const chemins = rendus.flatMap((r) => [r.image_path, r.masque_path, r.carte_path].filter((p): p is string => !!p));
  if (chemins.length > 0) await supabase.storage.from(BUCKET).remove(chemins);
}
