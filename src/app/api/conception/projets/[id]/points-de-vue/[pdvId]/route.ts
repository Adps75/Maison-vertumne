import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

type Params = Promise<{ id: string; pdvId: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;

    const { data: pdv, error } = await supabase
      .from("conception_points_de_vue")
      .select("*")
      .eq("id", pdvId)
      .eq("projet_id", id)
      .single();

    if (error || !pdv) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }

    let photo_url: string | null = null;
    if (pdv.photo_path) {
      const { data } = await supabase.storage
        .from("conception")
        .createSignedUrl(pdv.photo_path, 3600);
      photo_url = data?.signedUrl ?? null;
    }

    return NextResponse.json({ ok: true, point_de_vue: { ...pdv, photo_url } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Params },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* body vide */ }

    const updates: Record<string, unknown> = {};

    if (typeof body.nom === "string") updates.nom = body.nom;
    if (typeof body.statut === "string") updates.statut = body.statut;
    if (typeof body.zone_id === "string" || body.zone_id === null) updates.zone_id = body.zone_id;
    if (body.camera !== undefined) updates.camera = body.camera;
    if (body.soleil !== undefined) updates.soleil = body.soleil;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Rien à mettre à jour." }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: pdv, error } = await supabase
      .from("conception_points_de_vue")
      .update(updates)
      .eq("id", pdvId)
      .eq("projet_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!pdv) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, point_de_vue: pdv });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Params },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;

    // Récupérer le chemin de la photo avant suppression
    const { data: pdv } = await supabase
      .from("conception_points_de_vue")
      .select("photo_path")
      .eq("id", pdvId)
      .eq("projet_id", id)
      .single();

    if (!pdv) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }

    // Supprimer la photo du storage
    if (pdv.photo_path) {
      await supabase.storage.from("conception").remove([pdv.photo_path]);
    }

    // Supprimer la ligne
    const { error } = await supabase
      .from("conception_points_de_vue")
      .delete()
      .eq("id", pdvId)
      .eq("projet_id", id);

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
