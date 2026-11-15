import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { schemaAnalyseValidee, existantsAEvaluer } from "@/modules/conception/composition/schemas";
import { normaliserExistant } from "@/modules/conception/composition/controles";

const schemaCorps = z.union([
  z.object({ graine: z.number().int().min(0).max(2_147_483_647) }),
  z.object({ analyse_existant: schemaAnalyseValidee }),
]);

/** Enregistre l'analyse validée par le paysagiste, ou la graine de la proposition gardée. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; compId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId } = await params;
    const corps = schemaCorps.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Données invalides." }, { status: 400 });
    let maj: Record<string, unknown>;
    if ("graine" in corps.data) maj = { graine: corps.data.graine };
    else {
      // Règles fixes (surface → remplacer), puis plus aucun élément « à évaluer »
      const analyse = { ...corps.data.analyse_existant, existants: corps.data.analyse_existant.existants.map((e) => normaliserExistant(e)) };
      const restants = existantsAEvaluer(analyse);
      if (restants > 0) {
        return NextResponse.json({
          ok: false, code: "existant_a_evaluer",
          error: `${restants === 1 ? "1 élément est" : `${restants} éléments sont`} encore à évaluer : choisissez « Conserver » ou « Supprimer ».`,
        }, { status: 409 });
      }
      maj = { analyse_existant: analyse, analyse_validee: true };
    }
    const { error } = await supabase.from("conception_compositions").update(maj).eq("id", compId).eq("projet_id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
