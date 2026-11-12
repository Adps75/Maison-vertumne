import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererIntention, erreurConfigurationIA, ErreurComposition, type PlanteBibliotheque } from "@/modules/conception/composition/ia";
import { schemaBrief, schemaContexte, schemaAnalyseValidee } from "@/modules/conception/composition/schemas";

export const maxDuration = 300;

const schemaCorps = z.object({ plantes: z.array(z.string().min(1)).min(1).max(40) });

/** Intention de composition pour la palette validée (second appel à l'IA). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; compId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId } = await params;
    const corps = schemaCorps.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, code: "palette_invalide", error: "Palette vide ou invalide : retenez au moins une plante." }, { status: 400 });

    const { data: compo } = await supabase
      .from("conception_compositions")
      .select("id, brief, contexte, analyse_existant, analyse_validee, cout")
      .eq("id", compId)
      .eq("projet_id", id)
      .single();
    if (!compo) return NextResponse.json({ ok: false, code: "composition_introuvable", error: "Composition introuvable." }, { status: 404 });
    const erreurIA = erreurConfigurationIA();
    if (erreurIA) return NextResponse.json({ ok: false, code: "ia_non_configuree", error: erreurIA }, { status: 503 });

    const { data: plantes } = await supabase.from("plantes").select("*").in("id", corps.data.plantes);
    const palette = (plantes ?? []) as (PlanteBibliotheque & { image_face_path: string | null; image_dessus_path: string | null })[];
    const sansImages = palette.filter((p) => !p.image_face_path || !p.image_dessus_path);
    if (palette.length !== corps.data.plantes.length) {
      const connues = new Set(palette.map((p) => p.id));
      return NextResponse.json({
        ok: false, code: "plantes_absentes",
        plantes: corps.data.plantes.filter((pid) => !connues.has(pid)),
        error: "Certaines plantes de la palette n'existent plus dans la bibliothèque : retirez-les de la palette.",
      }, { status: 409 });
    }
    if (sansImages.length > 0) {
      const noms = sansImages.map((p) => p.nom_commun || p.nom_latin);
      return NextResponse.json({
        ok: false, code: "images_manquantes",
        plantes: sansImages.map((p) => ({ id: p.id, nom: p.nom_commun || p.nom_latin })),
        error: `${noms.join(", ")} ${noms.length > 1 ? "n'ont" : "n'a"} pas d'image.`,
      }, { status: 409 });
    }

    const brief = schemaBrief.parse(compo.brief);
    const contexte = schemaContexte.parse(compo.contexte);
    const analyse = compo.analyse_validee ? schemaAnalyseValidee.safeParse(compo.analyse_existant) : null;
    const { donnees: intention, cout } = await genererIntention(brief, contexte, palette, analyse?.success ? analyse.data : null);

    const { error } = await supabase
      .from("conception_compositions")
      .update({ intention, cout: Math.round((Number(compo.cout ?? 0) + cout) * 10000) / 10000 })
      .eq("id", compId);
    if (error) {
      console.error("[compositions] enregistrement de l'intention :", error);
      return NextResponse.json({ ok: false, code: "enregistrement", error: `Enregistrement de l'intention impossible : ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, intention, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurComposition) {
      console.error("[compositions] intention :", e.message);
      return NextResponse.json({ ok: false, code: "ia", error: e.message }, { status: e.status });
    }
    console.error("[compositions] intention :", e);
    return NextResponse.json({ ok: false, code: "inattendue", error: `L'intention de composition a échoué : ${e instanceof Error ? e.message.slice(0, 200) : "erreur inattendue"}` }, { status: 502 });
  }
}
