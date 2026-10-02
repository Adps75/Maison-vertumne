import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerViaBrevo } from "./brevo";

export interface ParamsEmail {
  supabase: SupabaseClient;
  leadId: string;
  type: string;
  destinataire: string;
  objet: string;
  html: string;
  pieceJointe?: { nom: string; contenuBase64: string };
  pathPieceJointe?: string;
}

/**
 * Envoie un email avec garantie de non-duplication.
 * EMAIL_MODE par défaut = "apercu" (jamais d'envoi réel sauf si explicitement "envoi").
 */
export async function envoyerEmail(params: ParamsEmail): Promise<void> {
  const { supabase, leadId, type, destinataire, objet, html, pieceJointe, pathPieceJointe } = params;
  const mode = process.env.EMAIL_MODE ?? "apercu";

  // Réserver la ligne AVANT l'envoi (non-duplication via contrainte unique)
  const { error: insertErr } = await supabase.from("emails_envoyes").insert({
    lead_id: leadId,
    type,
    destinataire,
    objet,
    html,
    piece_jointe: pathPieceJointe ?? null,
    statut: "en_cours",
  });

  if (insertErr) {
    // Doublon ou erreur — vérifier si c'est un doublon
    if (insertErr.code === "23505") {
      // Contrainte unique violée → déjà envoyé ou en cours
      // Vérifier s'il y a eu une erreur précédente (retentative)
      const { data: existant } = await supabase
        .from("emails_envoyes")
        .select("id, statut")
        .eq("lead_id", leadId)
        .eq("type", type)
        .single();

      if (existant?.statut === "erreur") {
        // Retentative : mettre à jour et réessayer
        await supabase
          .from("emails_envoyes")
          .update({ statut: "en_cours", html, objet, erreur: null })
          .eq("id", existant.id);
      } else {
        // Déjà envoyé ou en cours → ne rien faire
        return;
      }
    } else {
      throw insertErr;
    }
  }

  if (mode === "envoi") {
    try {
      await envoyerViaBrevo({ destinataire, objet, html, pieceJointe });

      await supabase
        .from("emails_envoyes")
        .update({ statut: "envoye" })
        .eq("lead_id", leadId)
        .eq("type", type);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";

      await supabase
        .from("emails_envoyes")
        .update({ statut: "erreur", erreur: message })
        .eq("lead_id", leadId)
        .eq("type", type);

      throw e;
    }
  } else {
    // Mode aperçu
    await supabase
      .from("emails_envoyes")
      .update({ statut: "apercu" })
      .eq("lead_id", leadId)
      .eq("type", type);
  }
}
