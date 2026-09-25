import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hacherJeton } from "@/lib/jeton";
import { schemaLeadPatch } from "@/lib/validation/lead-patch";

const COOKIE_LEAD = "adp_lead";

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const jetonCookie = cookieStore.get(COOKIE_LEAD);

  if (!jetonCookie?.value) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé." },
      { status: 401 },
    );
  }

  const hash = hacherJeton(jetonCookie.value);
  const supabase = await createClient();

  // Trouver le lead par l'empreinte du jeton
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("jeton_hash", hash)
    .single();

  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé." },
      { status: 401 },
    );
  }

  // Valider le body avec la liste blanche stricte
  const body = await request.json();
  const parsed = schemaLeadPatch.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Données invalides.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("leads")
    .update(parsed.data)
    .eq("id", lead.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
