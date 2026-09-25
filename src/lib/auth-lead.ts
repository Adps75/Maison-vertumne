import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hacherJeton } from "@/lib/jeton";

const COOKIE_LEAD = "adp_lead";

/**
 * Authentifie le lead courant via le cookie adp_lead.
 * Renvoie { supabase, leadId } ou null si invalide.
 */
export async function authentifierLead() {
  const cookieStore = await cookies();
  const jetonCookie = cookieStore.get(COOKIE_LEAD);

  if (!jetonCookie?.value) return null;

  const hash = hacherJeton(jetonCookie.value);
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("jeton_hash", hash)
    .single();

  if (!lead) return null;

  return { supabase, leadId: lead.id as string };
}
