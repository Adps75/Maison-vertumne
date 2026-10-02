import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vérifie que l'utilisateur courant est un administrateur (présent dans la table admins).
 * - Pour les pages : redirige vers /connexion si non connecté ou non admin.
 * - Pour les routes API : throw une erreur à attraper par le caller (renvoyer 401/403).
 *
 * @param mode "page" redirige, "api" throw
 * @returns { supabase, userId } si autorisé
 */
export async function exigerAdmin(mode: "page" | "api" = "page") {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (mode === "page") redirect("/connexion");
    throw new ErreurNonAutorise("Non authentifié.");
  }

  // Client admin (service_role) pour lire la table admins protégée par RLS
  const adminClient = createAdminClient();
  const { data: admin, error: adminError } = await adminClient
    .from("admins")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!admin) {
    if (mode === "page") redirect("/connexion");
    throw new ErreurNonAutorise("Accès réservé aux administrateurs.");
  }

  return { supabase: adminClient, userId: user.id };
}

export class ErreurNonAutorise extends Error {
  status: number;
  constructor(message: string) {
    super(message);
    this.name = "ErreurNonAutorise";
    this.status = user_missing(message) ? 401 : 403;
  }
}

function user_missing(msg: string) {
  return msg.includes("Non authentifié");
}
