import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase administrateur (service_role), sans cookies de session.
 * Contourne le RLS. À utiliser uniquement côté serveur pour les opérations
 * qui nécessitent un accès complet (vérification admins, etc.).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}
