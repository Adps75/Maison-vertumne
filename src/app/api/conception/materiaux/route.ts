import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

/** Bibliothèque des matériaux de l'atelier. */
export async function GET() {
  try {
    const { supabase } = await exigerAdmin("api");
    const { data, error } = await supabase.from("materiaux").select("*").order("ordre").order("nom");
    if (error) {
      // Migration 00025 non appliquée : liste vide, message explicite
      if (error.code === "42P01") return NextResponse.json({ ok: true, materiaux: [], avertissement: "Table materiaux absente : appliquer la migration 00025." });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const materiaux = (data ?? []).map((m) => ({
      ...m,
      prix_unitaire: m.prix_unitaire == null ? null : Number(m.prix_unitaire),
      largeur_m: m.largeur_m == null ? null : Number(m.largeur_m),
    }));
    return NextResponse.json({ ok: true, materiaux });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
