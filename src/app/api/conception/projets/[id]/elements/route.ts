import { NextRequest, NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data, error } = await supabase
      .from("conception_elements")
      .select("id, type, geometrie, calque, statut, hauteur, proprietes, ordre")
      .eq("projet_id", id)
      .order("ordre");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, elements: data });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    const body = await request.json();

    const { upserts, suppressions, updated_at } = body;

    // Appeler la RPC de sauvegarde atomique
    const { data, error } = await supabase.rpc("conception_sauvegarder", {
      p_projet_id: id,
      p_upserts: upserts ?? [],
      p_suppressions: suppressions ?? [],
      p_updated_at: updated_at,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // data est le résultat JSON de la fonction SQL
    const resultat = data as { ok: boolean; error?: string; updated_at?: string; server_updated_at?: string };

    if (!resultat.ok) {
      const status = resultat.error === "conflit" ? 409 : 500;
      return NextResponse.json(
        { ok: false, error: resultat.error, server_updated_at: resultat.server_updated_at },
        { status },
      );
    }

    return NextResponse.json({ ok: true, updated_at: resultat.updated_at });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
