import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererPalette, erreurConfigurationIA, ErreurComposition, type PlanteBibliotheque } from "@/modules/conception/composition/ia";
import { schemaBrief, schemaContexte, schemaAnalyseValidee } from "@/modules/conception/composition/schemas";

export const maxDuration = 300;

/** Palette proposée par l'IA, à partir du brief, du contexte et de l'analyse validée. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; compId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId } = await params;
    const { data: compo } = await supabase
      .from("conception_compositions")
      .select("id, brief, contexte, analyse_existant, analyse_validee, cout")
      .eq("id", compId).eq("projet_id", id).single();
    if (!compo) return NextResponse.json({ ok: false, code: "composition_introuvable", error: "Composition introuvable." }, { status: 404 });
    if (!compo.analyse_validee) return NextResponse.json({ ok: false, code: "analyse_non_validee", error: "Validez d'abord l'analyse des vues." }, { status: 409 });
    const erreurIA = erreurConfigurationIA();
    if (erreurIA) return NextResponse.json({ ok: false, code: "ia_non_configuree", error: erreurIA }, { status: 503 });

    const { data: plantes, error: errPlantes } = await supabase.from("plantes").select("*").eq("statut", "validee").order("nom_latin");
    if (errPlantes) {
      console.error("[compositions] bibliothèque :", errPlantes);
      return NextResponse.json({ ok: false, code: "bibliotheque", error: `Lecture de la bibliothèque impossible : ${errPlantes.message}` }, { status: 500 });
    }

    const { donnees: palette, modele, cout } = await genererPalette(
      schemaBrief.parse(compo.brief), schemaContexte.parse(compo.contexte),
      (plantes ?? []) as PlanteBibliotheque[], schemaAnalyseValidee.parse(compo.analyse_existant),
    );
    const { error } = await supabase.from("conception_compositions")
      .update({ palette, modele, cout: Math.round((Number(compo.cout ?? 0) + cout) * 10000) / 10000 })
      .eq("id", compId);
    if (error) {
      console.error("[compositions] enregistrement de la palette :", error);
      return NextResponse.json({ ok: false, code: "enregistrement", error: `Enregistrement de la palette impossible : ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, palette, modele, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurComposition) {
      console.error("[compositions] palette :", e.message);
      return NextResponse.json({ ok: false, code: "ia", error: e.message }, { status: e.status });
    }
    console.error("[compositions] palette :", e);
    return NextResponse.json({ ok: false, code: "inattendue", error: `La proposition de palette a échoué : ${e instanceof Error ? e.message.slice(0, 200) : "erreur inattendue"}` }, { status: 502 });
  }
}
