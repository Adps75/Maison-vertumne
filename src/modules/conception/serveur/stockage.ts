/**
 * Suppression des fichiers de stockage d'un projet ou d'une plante (bucket « conception »).
 *
 * Par sécurité, seuls les dossiers « projets/<uuid> » et « plantes/<uuid> » peuvent être
 * vidés : jamais la racine ni un dossier parent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_CONCEPTION = "conception";

const DOSSIER_AUTORISE = /^(projets|plantes)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE = 1000;

export function dossierAutorise(dossier: string): boolean {
  return DOSSIER_AUTORISE.test(dossier);
}

/** Liste récursivement les fichiers d'un dossier (les sous-dossiers ont un id nul). */
export async function listerFichiers(supabase: SupabaseClient, dossier: string): Promise<string[]> {
  if (!dossierAutorise(dossier)) throw new Error(`Dossier de stockage refusé : ${dossier}`);
  const fichiers: string[] = [];
  const aParcourir = [dossier];
  while (aParcourir.length > 0) {
    const courant = aParcourir.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage.from(BUCKET_CONCEPTION).list(courant, { limit: PAGE, offset });
      if (error) throw new Error(`Lecture du stockage impossible (${courant}) : ${error.message}`);
      if (!data || data.length === 0) break;
      for (const element of data) {
        const chemin = `${courant}/${element.name}`;
        if (element.id === null) aParcourir.push(chemin);
        else fichiers.push(chemin);
      }
      if (data.length < PAGE) break;
    }
  }
  return fichiers;
}

/** Supprime tous les fichiers d'un dossier « projets/<uuid> » ou « plantes/<uuid> ». Renvoie leur nombre. */
export async function supprimerDossier(supabase: SupabaseClient, dossier: string): Promise<number> {
  const fichiers = await listerFichiers(supabase, dossier);
  for (let i = 0; i < fichiers.length; i += PAGE) {
    const { error } = await supabase.storage.from(BUCKET_CONCEPTION).remove(fichiers.slice(i, i + PAGE));
    if (error) throw new Error(`Suppression du stockage impossible (${dossier}) : ${error.message}`);
  }
  return fichiers.length;
}
