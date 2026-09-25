import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { genererJeton, hacherJeton } from "@/lib/jeton";
import { normaliserTelephone } from "@/lib/validation/coordonnees";

const COOKIE_LEAD = "adp_lead";
const COOKIE_UTM = "adp_utm";
const DUREE_COOKIE = 30 * 24 * 60 * 60; // 30 jours
const DELAI_ANTI_SPAM_MS = 3000;

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Anti-spam : champ piège
  if (body.adp_verif) {
    console.warn("[anti-spam] Champ piège rempli, rejet silencieux.");
    return NextResponse.json({ ok: true, id: "fake" });
  }

  // Anti-spam : durée écoulée
  const duree = typeof body._duree === "number" ? body._duree : 0;
  if (duree < DELAI_ANTI_SPAM_MS) {
    console.warn(`[anti-spam] Soumission trop rapide (${duree}ms), rejet silencieux.`);
    return NextResponse.json({ ok: true, id: "fake" });
  }

  const {
    type_lieu,
    adresse_label,
    lat,
    lon,
    code_insee,
    parcelle_geojson,
    surface_parcelle,
    prenom,
    email,
    telephone,
    lead_id: bodyLeadId,
  } = body;

  const telephoneNormalise = normaliserTelephone(telephone ?? "");

  // Lecture du cookie UTM
  const cookieStore = await cookies();
  const utmCookie = cookieStore.get(COOKIE_UTM);
  let utm: Record<string, string> = {};
  if (utmCookie?.value) {
    try {
      utm = JSON.parse(utmCookie.value);
    } catch {
      // Cookie UTM invalide, on continue sans
    }
  }

  // Données du lead
  const donnees = {
    type_lieu: type_lieu ?? "maison",
    adresse_label,
    lat,
    lon,
    code_insee,
    parcelle_geojson: parcelle_geojson ?? null,
    surface_parcelle: surface_parcelle ?? null,
    prenom,
    email,
    telephone: telephoneNormalise,
    consentement_rgpd: true,
    consentement_date: new Date().toISOString(),
    etape_atteinte: 3,
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_content: utm.utm_content ?? null,
    page_arrivee: utm.page_arrivee ?? null,
  };

  const supabase = await createClient();

  // Vérifier s'il y a un lead en cours (cookie + identifiant du parcours)
  const jetonCookie = cookieStore.get(COOKIE_LEAD);
  if (jetonCookie?.value && bodyLeadId) {
    const hash = hacherJeton(jetonCookie.value);
    const { data: existing } = await supabase
      .from("leads")
      .select("id, jeton_hash")
      .eq("id", bodyLeadId)
      .eq("jeton_hash", hash)
      .single();

    if (existing) {
      // Mise à jour du lead existant
      const { error } = await supabase
        .from("leads")
        .update(donnees)
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, id: existing.id });
    }
  }

  // Création d'un nouveau lead avec un nouveau jeton
  const jeton = genererJeton();
  const hash = hacherJeton(jeton);

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...donnees, jeton_hash: hash })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Erreur lors de la création du lead." },
      { status: 500 },
    );
  }

  // Cookie du jeton
  const response = NextResponse.json({ ok: true, id: data.id });
  response.cookies.set(COOKIE_LEAD, jeton, {
    maxAge: DUREE_COOKIE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
