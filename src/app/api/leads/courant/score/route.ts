import { NextResponse } from "next/server";
import { authentifierLead } from "@/lib/auth-lead";
import { calculerScore } from "@/lib/score";
import type { AnalyseIA } from "@/lib/validation/analyse";

export async function POST() {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead introuvable." }, { status: 404 });
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("id")
    .eq("lead_id", leadId);

  const analyse = (lead.analyse_ia as AnalyseIA | null) ?? null;

  const score = calculerScore(
    {
      fourchette_max: lead.fourchette_max,
      fourchette_min: lead.fourchette_min,
      lat: lead.lat,
      lon: lead.lon,
      proprietaire: lead.proprietaire,
      urgence: lead.urgence,
      budget_declare: lead.budget_declare,
      rappel_souhaite: lead.rappel_souhaite,
      description: lead.description,
      types_amenagement: lead.types_amenagement,
      nb_photos: photos?.length ?? 0,
    },
    analyse,
  );

  await supabase
    .from("leads")
    .update({
      score_valeur: score.interet,
      score_chaleur: score.fiabilite,
      score_total: score.total,
      categorie: score.categorie,
      analyse_ia: analyse ? { ...analyse, score_detail: score.detail } : null,
    })
    .eq("id", leadId);

  return NextResponse.json({ ok: true, ...score });
}
