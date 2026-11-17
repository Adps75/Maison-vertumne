import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ImageSignee {
  /** URL signée (1 h), ou null si elle n'a pas pu être fabriquée. */
  url: string | null;
  /** Présence de l'image : chemin enregistré et fichier présent dans le stockage. */
  presente: boolean;
}

/** Le stockage signale-t-il un fichier absent (et non une erreur passagère) ? */
export function estFichierAbsent(erreur: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!erreur) return false;
  return /not.?found|n'existe pas|404/i.test(`${erreur.message ?? ""} ${erreur.statusCode ?? ""}`);
}

/**
 * URL signée d'une image de plante. La présence se juge d'après le chemin enregistré :
 * une signature qui échoue est retentée une fois, puis journalisée ; seule une réponse
 * « fichier absent » du stockage rend l'image absente.
 */
export async function imageSignee(supabase: SupabaseClient, path: string | null | undefined, bucket = "conception"): Promise<ImageSignee> {
  if (!path) return { url: null, presente: false };
  let derniere = null as { message?: string; statusCode?: string | number } | null;
  for (let essai = 0; essai < 2; essai++) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) return { url: data.signedUrl, presente: true };
    derniere = error as typeof derniere;
    if (estFichierAbsent(derniere)) return { url: null, presente: false };
  }
  console.error(`[plantes] URL signée impossible pour ${path} (deux essais) : ${derniere?.message ?? "erreur inconnue"}`);
  return { url: null, presente: true };
}
