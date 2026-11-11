import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { chargerPointDeVue, supprimerFichiersRendus, type LigneRendu } from "@/modules/conception/serveur/rendus-stockage";

type Params = Promise<{ id: string; pdvId: string; renduId: string }>;

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId, renduId } = await params;
    if (!(await chargerPointDeVue(supabase, id, pdvId))) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }
    const { data: rendu } = await supabase
      .from("conception_rendus")
      .select("image_path, masque_path")
      .eq("id", renduId)
      .eq("point_de_vue_id", pdvId)
      .single();
    if (!rendu) return NextResponse.json({ ok: false, error: "Rendu introuvable." }, { status: 404 });

    await supprimerFichiersRendus(supabase, [rendu as Pick<LigneRendu, "image_path" | "masque_path">]);
    const { error } = await supabase.from("conception_rendus").delete().eq("id", renduId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
