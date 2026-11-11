import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererIntention, ErreurComposition, type PlanteBibliotheque } from "@/modules/conception/composition/ia";
import { schemaBrief, schemaContexte } from "@/modules/conception/composition/schemas";

export const maxDuration = 300;

const schemaCorps = z.object({ plantes: z.array(z.string().min(1)).min(1).max(40) });

/** Intention de composition pour la palette validée (second appel à l'IA). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; compId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId } = await params;
    const corps = schemaCorps.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Palette vide ou invalide." }, { status: 400 });

    const { data: compo } = await supabase
      .from("conception_compositions")
      .select("id, brief, contexte, cout")
      .eq("id", compId)
      .eq("projet_id", id)
      .single();
    if (!compo) return NextResponse.json({ ok: false, error: "Composition introuvable." }, { status: 404 });

    const { data: plantes } = await supabase.from("plantes").select("*").in("id", corps.data.plantes);
    const palette = (plantes ?? []) as (PlanteBibliotheque & { image_face_path: string | null; image_dessus_path: string | null })[];
    const sansImages = palette.filter((p) => !p.image_face_path || !p.image_dessus_path);
    if (palette.length !== corps.data.plantes.length) {
      return NextResponse.json({ ok: false, error: "Certaines plantes de la palette n'existent pas dans la bibliothèque." }, { status: 400 });
    }
    if (sansImages.length > 0) {
      return NextResponse.json({ ok: false, error: `Images manquantes : ${sansImages.map((p) => p.nom_latin).join(", ")}.` }, { status: 409 });
    }

    const brief = schemaBrief.parse(compo.brief);
    const contexte = schemaContexte.parse(compo.contexte);
    const { donnees: intention, cout } = await genererIntention(brief, contexte, palette);

    const { error } = await supabase
      .from("conception_compositions")
      .update({ intention, cout: Math.round((Number(compo.cout ?? 0) + cout) * 10000) / 10000 })
      .eq("id", compId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, intention, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurComposition) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[compositions] intention :", e);
    return NextResponse.json({ ok: false, error: "L'intention de composition a échoué." }, { status: 502 });
  }
}
