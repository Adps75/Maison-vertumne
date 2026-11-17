import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { BUCKET, chargerPointDeVue } from "@/modules/conception/serveur/rendus-stockage";

type Params = Promise<{ id: string; pdvId: string; renduId: string }>;

/** Image d'un rendu (PNG pleine résolution), son masque (?type=masque) sa carte des matériaux (?type=carte) ou sa base stylisée (?type=base). */
export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId, renduId } = await params;
    if (!(await chargerPointDeVue(supabase, id, pdvId))) {
      return NextResponse.json({ error: "Point de vue introuvable." }, { status: 404 });
    }
    const { data: rendu } = await supabase
      .from("conception_rendus")
      .select("image_path, masque_path, carte_path, base_id")
      .eq("id", renduId)
      .eq("point_de_vue_id", pdvId)
      .single();
    const type = new URL(request.url).searchParams.get("type");
    let path = type === "masque" ? rendu?.masque_path : type === "carte" ? rendu?.carte_path : rendu?.image_path;
    if (type === "base") {
      // Base stylisée utilisée par ce rendu (styles dessinés)
      const { data: base } = rendu?.base_id
        ? await supabase.from("conception_bases_stylisees").select("image_path").eq("id", rendu.base_id).maybeSingle()
        : { data: null };
      path = base?.image_path ?? null;
    }
    if (!path) return NextResponse.json({ error: "Image absente." }, { status: 404 });

    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
