import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { obtenirBase } from "@/modules/conception/serveur/rendus";
import { BUCKET, chargerPointDeVue, cleReferences, referencesActives } from "@/modules/conception/serveur/rendus-stockage";
import { calculerCout } from "@/modules/conception/config/style-plantes";

export const maxDuration = 300;

type Params = Promise<{ id: string; pdvId: string }>;
const STYLES_DESSINES = ["croquis", "aquarelle", "feutres"] as const;
const schemaStyle = z.enum(STYLES_DESSINES);

/** Base stylisée de la vue pour un style (et les références actives) : état, ou image avec ?image=1. */
export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;
    const url = new URL(request.url);
    const style = schemaStyle.safeParse(url.searchParams.get("style"));
    if (!style.success) return NextResponse.json({ ok: false, error: "Style dessiné attendu." }, { status: 400 });
    if (!(await chargerPointDeVue(supabase, id, pdvId))) return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    const cle = cleReferences(await referencesActives(supabase, style.data));
    const { data: base } = await supabase.from("conception_bases_stylisees").select("id, image_path, cout, created_at")
      .eq("point_de_vue_id", pdvId).eq("style", style.data).eq("cle_references", cle).maybeSingle();
    if (url.searchParams.get("image") === "1") {
      if (!base) return NextResponse.json({ ok: false, error: "Aucune base." }, { status: 404 });
      const { data, error } = await supabase.storage.from(BUCKET).download(base.image_path);
      if (error || !data) return NextResponse.json({ ok: false, error: "Image absente." }, { status: 404 });
      return new NextResponse(new Uint8Array(await data.arrayBuffer()), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ ok: true, base: base ? { id: base.id, cout: Number(base.cout), created_at: base.created_at } : null });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

/** « Refaire la base » : régénère la base stylisée de la vue pour ce style. */
export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;
    const corps = z.object({ style: schemaStyle }).safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Style dessiné attendu." }, { status: 400 });
    const pdv = await chargerPointDeVue(supabase, id, pdvId);
    if (!pdv) return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    const refs = await referencesActives(supabase, corps.data.style);
    const references = await Promise.all(refs.map(async (r) => {
      const { data } = await supabase.storage.from(BUCKET).download(r.path);
      return Buffer.from(await data!.arrayBuffer());
    }));
    const base = await obtenirBase({ supabase, projetId: id, pdv, style: corps.data.style, refs, references, refaire: true });
    return NextResponse.json({ ok: true, base: { id: base.id, cout: base.usage ? calculerCout(base.usage) : 0 } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[rendus] base :", e);
    return NextResponse.json({ ok: false, error: `La base n'a pas pu être générée : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}` }, { status: 502 });
  }
}
