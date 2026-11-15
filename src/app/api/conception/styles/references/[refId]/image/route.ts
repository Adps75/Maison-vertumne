import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { BUCKET } from "@/modules/conception/serveur/rendus-stockage";

/** Image d'une référence de style (y compris retirée, pour la trace d'un rendu). */
export async function GET(_request: Request, { params }: { params: Promise<{ refId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { refId } = await params;
    const { data: ref } = await supabase.from("conception_styles_references").select("path").eq("id", refId).single();
    if (!ref) return NextResponse.json({ ok: false, error: "Référence introuvable." }, { status: 404 });
    const { data, error } = await supabase.storage.from(BUCKET).download(ref.path);
    if (error || !data) return NextResponse.json({ ok: false, error: "Image absente." }, { status: 404 });
    return new NextResponse(new Uint8Array(await data.arrayBuffer()), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
