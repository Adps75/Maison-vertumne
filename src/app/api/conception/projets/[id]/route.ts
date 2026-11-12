import { NextResponse } from "next/server";
import { supprimerDossier } from "@/modules/conception/serveur/stockage";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: projet, error } = await supabase
      .from("conception_projets")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !projet) {
      return NextResponse.json({ ok: false, error: "Projet introuvable." }, { status: 404 });
    }

    // Signed URLs pour l'orthophoto et le relief
    let orthoUrl: string | null = null;
    if (projet.ortho_path) {
      const { data } = await supabase.storage
        .from("conception")
        .createSignedUrl(projet.ortho_path, 3600);
      orthoUrl = data?.signedUrl ?? null;
    }

    let reliefUrl: string | null = null;
    if (projet.relief_path && typeof projet.relief_path === "string") {
      const { data } = await supabase.storage
        .from("conception")
        .createSignedUrl(projet.relief_path, 3600);
      reliefUrl = data?.signedUrl ?? null;
    }

    return NextResponse.json({
      ok: true,
      projet: { ...projet, ortho_url: orthoUrl, relief_url: reliefUrl },
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
    if (typeof body.tolerance_chevauchement === "number") {
      updates.tolerance_chevauchement = Math.max(0, Math.min(0.4, body.tolerance_chevauchement));
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    // Supprimer l'orthophoto du storage
    const { data: projet } = await supabase
      .from("conception_projets")
      .select("ortho_path")
      .eq("id", id)
      .single();

    if (projet?.ortho_path) {
      await supabase.storage.from("conception").remove([projet.ortho_path]);
    }
    // Tous les autres fichiers du projet : photos des vues, rendus, relief
    await supprimerDossier(supabase, `projets/${id}`);

    const { error } = await supabase
      .from("conception_projets")
      .delete()
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
