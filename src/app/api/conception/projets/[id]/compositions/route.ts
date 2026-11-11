import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererPalette, ErreurComposition, type PlanteBibliotheque } from "@/modules/conception/composition/ia";
import { schemaBrief, schemaContexte } from "@/modules/conception/composition/schemas";

// Un appel à l'IA avec réflexion peut durer plusieurs dizaines de secondes
export const maxDuration = 300;

const schemaCorps = z.object({
  zoneId: z.string().min(1),
  brief: schemaBrief,
  contexte: schemaContexte,
});

/** Crée une composition : brief + contexte → palette proposée par l'IA. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    const corps = schemaCorps.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Brief incomplet ou invalide." }, { status: 400 });

    const { data: projet } = await supabase.from("conception_projets").select("id").eq("id", id).single();
    if (!projet) return NextResponse.json({ ok: false, error: "Projet introuvable." }, { status: 404 });

    // Bibliothèque : plantes validées (toutes les colonnes, migrations éventuellement absentes)
    const { data: plantes, error: errPlantes } = await supabase.from("plantes").select("*").eq("statut", "validee").order("nom_latin");
    if (errPlantes) return NextResponse.json({ ok: false, error: errPlantes.message }, { status: 500 });
    const bibliotheque = (plantes ?? []) as PlanteBibliotheque[];

    const { donnees: palette, modele, cout } = await genererPalette(corps.data.brief, corps.data.contexte, bibliotheque);

    const { data: composition, error } = await supabase
      .from("conception_compositions")
      .insert({
        projet_id: id,
        zone_id: corps.data.zoneId,
        brief: corps.data.brief,
        contexte: corps.data.contexte,
        palette,
        modele,
        cout,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, compositionId: composition.id, palette, modele, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurComposition) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[compositions] palette :", e);
    return NextResponse.json({ ok: false, error: "La proposition de palette a échoué." }, { status: 502 });
  }
}
