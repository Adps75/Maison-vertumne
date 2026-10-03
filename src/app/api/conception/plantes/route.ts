import { NextRequest, NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await exigerAdmin("api");
    const categorie = request.nextUrl.searchParams.get("categorie");
    const recherche = request.nextUrl.searchParams.get("q");

    let query = supabase
      .from("plantes")
      .select("id, nom_commun, nom_latin, categorie, forme, hauteur_adulte_m, largeur_adulte_m, image_face_path, image_dessus_path, statut, est_reference, cout_generation_total")
      .order("nom_commun");

    if (categorie) query = query.eq("categorie", categorie);
    if (recherche) query = query.or(`nom_commun.ilike.%${recherche}%,nom_latin.ilike.%${recherche}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Signed URLs pour les images
    const plantes = await Promise.all(
      (data ?? []).map(async (p) => {
        let faceUrl = null;
        let dessusUrl = null;
        if (p.image_face_path) {
          const { data: d } = await supabase.storage.from("conception").createSignedUrl(p.image_face_path, 3600);
          faceUrl = d?.signedUrl ?? null;
        }
        if (p.image_dessus_path) {
          const { data: d } = await supabase.storage.from("conception").createSignedUrl(p.image_dessus_path, 3600);
          dessusUrl = d?.signedUrl ?? null;
        }
        return { ...p, face_url: faceUrl, dessus_url: dessusUrl };
      }),
    );

    return NextResponse.json({ ok: true, plantes });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await exigerAdmin("api");
    const body = await request.json();

    // Vérifier doublon par nom latin
    const nomLatinNorm = (body.nom_latin ?? "").trim().toLowerCase();
    if (nomLatinNorm) {
      const { data: existant } = await supabase
        .from("plantes")
        .select("id, nom_commun, nom_latin")
        .ilike("nom_latin", nomLatinNorm)
        .limit(1);

      if (existant && existant.length > 0) {
        return NextResponse.json({
          ok: false,
          doublon: true,
          plante_existante: existant[0],
          error: `Une plante avec le nom latin "${existant[0].nom_latin}" existe déjà.`,
        }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("plantes")
      .insert({
        nom_commun: body.nom_commun,
        nom_latin: body.nom_latin,
        categorie: body.categorie,
        largeur_adulte_m: body.largeur_adulte_m ?? null,
        hauteur_adulte_m: body.hauteur_adulte_m ?? null,
        forme: body.forme ?? null,
        feuillage: body.feuillage ?? null,
        couleur_feuillage: body.couleur_feuillage ?? null,
        couleur_floraison: body.couleur_floraison ?? null,
        periode_floraison: body.periode_floraison ?? null,
        notes: body.notes ?? null,
        floraison_visible: body.floraison_visible ?? false,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
