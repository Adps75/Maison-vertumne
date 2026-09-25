import { NextResponse, after } from "next/server";
import { authentifierLead } from "@/lib/auth-lead";
import { lancerAnalyse } from "@/lib/analyse";

export const maxDuration = 120;
import { calculerFourchette } from "@/lib/estimation";
import {
  schemaTarif,
  schemaDegressivite,
  schemaCoeffLogistique,
  schemaSurfaceDefaut,
} from "@/lib/validation/tarifs";
import type { Tarif, ParametresEstimation, ProjetEstimation } from "@/lib/types/tarifs";

export async function POST() {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;

  // Charger le lead
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "type_lieu, types_amenagement, surface_projet, tranche_surface, etage, acces",
    )
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ ok: false, error: "Lead introuvable." }, { status: 404 });
  }

  const typeLieu = lead.type_lieu as "maison" | "appartement";

  // Charger les tarifs du type de lieu
  const { data: tarifsRaw, error: tarifsErr } = await supabase
    .from("tarifs")
    .select("type_amenagement, prix_m2_min, prix_m2_max, mode, part_defaut, forfait_minimum")
    .eq("type_lieu", typeLieu);

  if (tarifsErr || !tarifsRaw) {
    return NextResponse.json({ ok: false, error: "Tarifs introuvables." }, { status: 500 });
  }

  // Valider les tarifs avec Zod
  const tarifs: Tarif[] = [];
  for (const row of tarifsRaw) {
    const parsed = schemaTarif.safeParse(row);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: `Tarif invalide pour ${row.type_amenagement}.` },
        { status: 500 },
      );
    }
    tarifs.push(parsed.data);
  }

  // Charger et valider les paramètres
  const { data: paramsRaw } = await supabase
    .from("parametres_estimation")
    .select("cle, valeur");

  if (!paramsRaw || paramsRaw.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Paramètres d'estimation manquants." },
      { status: 500 },
    );
  }

  const paramsMap = new Map(paramsRaw.map((p) => [p.cle, p.valeur]));

  const degResult = schemaDegressivite.safeParse(paramsMap.get("degressivite"));
  const coeffResult = schemaCoeffLogistique.safeParse(paramsMap.get("coeff_logistique"));
  const surfResult = schemaSurfaceDefaut.safeParse(paramsMap.get("surface_defaut"));

  if (!degResult.success || !coeffResult.success || !surfResult.success) {
    return NextResponse.json(
      { ok: false, error: "Paramètres d'estimation invalides." },
      { status: 500 },
    );
  }

  const parametres: ParametresEstimation = {
    degressivite: degResult.data,
    coeff_logistique: coeffResult.data,
    surface_defaut: surfResult.data,
  };

  // Construire le projet
  const projet: ProjetEstimation = {
    type_lieu: typeLieu,
    types_amenagement: lead.types_amenagement ?? [],
    surface: lead.surface_projet ?? null,
    etage: lead.etage ?? undefined,
    acces: lead.acces ?? undefined,
  };

  // Calculer
  const resultat = calculerFourchette(projet, tarifs, parametres);

  // Enregistrer
  const { error: updateErr } = await supabase
    .from("leads")
    .update({
      fourchette_min: resultat.min,
      fourchette_max: resultat.max,
      etape_atteinte: 7,
    })
    .eq("id", leadId);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  // Lancer l'analyse IA en arrière-plan
  after(() => lancerAnalyse(leadId));

  return NextResponse.json({ ok: true, ...resultat });
}
