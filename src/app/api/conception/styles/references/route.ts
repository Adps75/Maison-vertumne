import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { STYLES } from "@/modules/conception/rendu/styles";
import { referencesActives } from "@/modules/conception/serveur/rendus-stockage";

/** Images de référence actives, par style (communes à l'atelier). */
export async function GET() {
  try {
    const { supabase } = await exigerAdmin("api");
    const parStyle: Record<string, { id: string; created_at: string }[]> = {};
    for (const style of STYLES) {
      parStyle[style] = (await referencesActives(supabase, style)).map((r) => ({ id: r.id, created_at: r.created_at }));
    }
    return NextResponse.json({ ok: true, references: parStyle });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
