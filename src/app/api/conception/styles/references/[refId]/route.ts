import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { BUCKET } from "@/modules/conception/serveur/rendus-stockage";

/**
 * Retire une image de référence du style (remplaçable). Par défaut elle est désactivée,
 * jamais effacée : les rendus qui l'ont utilisée en gardent la trace.
 * `?definitif=1` l'efface (ligne et fichier), seulement si aucun rendu ne l'a utilisée
 * (nettoyage des données de test).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ refId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { refId } = await params;
    const definitif = new URL(request.url).searchParams.get("definitif") === "1";
    if (!definitif) {
      const { error } = await supabase.from("conception_styles_references").update({ actif: false }).eq("id", refId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const { data: utilisee } = await supabase.from("conception_rendus").select("id")
      .contains("references_utilisees", [{ id: refId }]).limit(1);
    if ((utilisee ?? []).length > 0) {
      return NextResponse.json({ ok: false, code: "reference_utilisee", error: "Cette référence a servi à un rendu : elle est seulement retirée." }, { status: 409 });
    }
    const { data: ref } = await supabase.from("conception_styles_references").select("path").eq("id", refId).single();
    if (ref) await supabase.storage.from(BUCKET).remove([ref.path]);
    const { error } = await supabase.from("conception_styles_references").delete().eq("id", refId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
