import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

const NOMS = new Set(["plan", "vue-1", "vue-2"]);

/** Image envoyée au modèle pour l'analyse (plan ou vue), conservée avec la composition. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; compId: string; nom: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId, nom } = await params;
    if (!NOMS.has(nom)) return NextResponse.json({ error: "Image inconnue." }, { status: 404 });
    const { data: compo } = await supabase.from("conception_compositions").select("id").eq("id", compId).eq("projet_id", id).single();
    if (!compo) return NextResponse.json({ error: "Composition introuvable." }, { status: 404 });
    const { data, error } = await supabase.storage.from("conception").download(`projets/${id}/compositions/${compId}/${nom}.jpg`);
    if (error || !data) return NextResponse.json({ error: "Image absente." }, { status: 404 });
    return new NextResponse(new Uint8Array(await data.arrayBuffer()), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
