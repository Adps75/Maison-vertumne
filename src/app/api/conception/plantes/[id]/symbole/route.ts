import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererSymbolePlan } from "@/modules/conception/ia/normalisation";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: plante } = await supabase.from("plantes").select("couleur_feuillage").eq("id", id).single();
    if (!plante) return NextResponse.json({ ok: false, error: "Plante introuvable." }, { status: 404 });

    const symbole = await genererSymbolePlan(plante.couleur_feuillage ?? "#4a7c59");
    const path = `plantes/${id}/dessus.png`;
    await supabase.storage.from("conception").upload(path, symbole, { contentType: "image/png", upsert: true });
    await supabase.from("plantes").update({ image_dessus_path: path }).eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
