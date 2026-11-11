import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererRendu, ErreurRendu } from "@/modules/conception/serveur/rendus";
import { chargerPointDeVue, schemaGeneration, type LigneRendu } from "@/modules/conception/serveur/rendus-stockage";

// Une édition d'image dure plusieurs dizaines de secondes
export const maxDuration = 300;

type Params = Promise<{ id: string; pdvId: string }>;

/** Liste des rendus d'une vue, du plus récent au plus ancien. */
export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;
    if (!(await chargerPointDeVue(supabase, id, pdvId))) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }
    const { data, error } = await supabase
      .from("conception_rendus")
      .select("*")
      .eq("point_de_vue_id", pdvId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rendus: (data ?? []) as LigneRendu[] });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

/** Génère un rendu à partir des couches déposées (voir /preparer). */
export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;
    const corps = schemaGeneration.safeParse(await request.json().catch(() => null));
    if (!corps.success) {
      return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
    }
    const pdv = await chargerPointDeVue(supabase, id, pdvId);
    if (!pdv) return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });

    const rendu = await genererRendu({ supabase, projetId: id, pdv, renduId: corps.data.renduId, style: corps.data.style });
    return NextResponse.json({ ok: true, rendu });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurRendu) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[rendus] génération :", e);
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: `La génération a échoué : ${message.slice(0, 300)}` }, { status: 502 });
  }
}
