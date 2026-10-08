import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { recupererGrilleRelief, calculerAltitudeReference } from "@/modules/conception/serveur/relief";
import type { OrigineLocale } from "@/modules/conception/geo/projection";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    // Récupérer le projet
    const { data: projet, error: errProjet } = await supabase
      .from("conception_projets")
      .select("parcelles_geojson, batiments_geojson, origine_l93, relief_path")
      .eq("id", id)
      .single();

    if (errProjet || !projet) {
      return NextResponse.json({ ok: false, error: "Projet introuvable." }, { status: 404 });
    }

    const origine: OrigineLocale = {
      x: projet.origine_l93[0],
      y: projet.origine_l93[1],
    };

    // Calculer l'emprise de la parcelle en L93 absolu
    const parcelle = projet.parcelles_geojson;
    if (!parcelle) {
      return NextResponse.json({ ok: false, error: "Pas de parcelle." }, { status: 400 });
    }

    const emprise = calculerEmpriseAbsolue(parcelle, origine);

    // Récupérer la grille d'altitudes
    const grille = await recupererGrilleRelief(emprise, 1, origine);

    if (!grille) {
      return NextResponse.json({
        ok: true,
        relief_disponible: false,
        message: "Service d'altimétrie indisponible ou zone non couverte. Terrain plat.",
      });
    }

    // Stocker dans le bucket
    const reliefPath = `projets/${id}/relief.json`;
    const { error: errUpload } = await supabase.storage
      .from("conception")
      .upload(reliefPath, JSON.stringify(grille), {
        contentType: "application/json",
        upsert: true,
      });

    if (errUpload) {
      return NextResponse.json({ ok: false, error: errUpload.message }, { status: 500 });
    }

    // Calculer l'altitude de référence par défaut
    const batiments = projet.batiments_geojson ?? [];
    const altRef = calculerAltitudeReference(grille, batiments);

    // Mettre à jour le projet
    const { error: errUpdate } = await supabase
      .from("conception_projets")
      .update({
        relief_path: reliefPath,
        altitude_reference_ngf: altRef,
      })
      .eq("id", id);

    if (errUpdate) {
      return NextResponse.json({ ok: false, error: errUpdate.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      relief_disponible: true,
      altitude_reference_ngf: altRef,
      grille_colonnes: grille.colonnes,
      grille_lignes: grille.lignes,
      nombre_points: grille.colonnes * grille.lignes,
      resource: "ign_lidar_hd_mnt_mono_wld (repli RGE ALTI si nécessaire)",
    });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("[relief] erreur:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: projet, error } = await supabase
      .from("conception_projets")
      .select("relief_path, altitude_reference_ngf")
      .eq("id", id)
      .single();

    if (error || !projet) {
      return NextResponse.json({ ok: false, error: "Projet introuvable." }, { status: 404 });
    }

    let reliefUrl: string | null = null;
    if (projet.relief_path) {
      const { data } = await supabase.storage
        .from("conception")
        .createSignedUrl(projet.relief_path, 3600);
      reliefUrl = data?.signedUrl ?? null;
    }

    return NextResponse.json({
      ok: true,
      relief_url: reliefUrl,
      altitude_reference_ngf: projet.altitude_reference_ngf,
    });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* body vide */ }

    const updates: Record<string, unknown> = {};
    if (typeof body.altitude_reference_ngf === "number") {
      updates.altitude_reference_ngf = body.altitude_reference_ngf;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Rien à mettre à jour." }, { status: 400 });
    }

    const { error } = await supabase
      .from("conception_projets")
      .update(updates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

function calculerEmpriseAbsolue(
  parcelle: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  origine: OrigineLocale,
) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const rings =
    parcelle.type === "MultiPolygon"
      ? parcelle.coordinates.flat(1)
      : parcelle.coordinates;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      const absX = x + origine.x;
      const absY = y + origine.y;
      if (absX < xMin) xMin = absX;
      if (absY < yMin) yMin = absY;
      if (absX > xMax) xMax = absX;
      if (absY > yMax) yMax = absY;
    }
  }
  return { xMin, yMin, xMax, yMax };
}
