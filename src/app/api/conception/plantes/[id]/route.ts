import { NextRequest, NextResponse } from "next/server";
import { supprimerDossier } from "@/modules/conception/serveur/stockage";
import { projetsUtilisantPlante, messagePlanteUtilisee } from "@/modules/conception/vegetaux/utilisation";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    const body = await request.json();

    // Si on marque comme référence, décocher les autres
    if (body.est_reference === true) {
      await supabase.from("plantes").update({ est_reference: false }).neq("id", id);
    }

    const { error } = await supabase.from("plantes").update(body).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    // Refus si la plante est utilisée (plan ou composition) : message avec les projets concernés
    const [{ data: elements, error: e1 }, { data: compositions, error: e2 }] = await Promise.all([
      supabase.from("conception_elements").select("projet_id").eq("proprietes->>plante_id", id),
      supabase.from("conception_compositions").select("projet_id, palette, intention"),
    ]);
    if (e1 || e2) return NextResponse.json({ ok: false, error: (e1 ?? e2)!.message }, { status: 500 });
    const idsProjets = [...new Set([...(elements ?? []), ...(compositions ?? [])].map((x) => x.projet_id as string))];
    const { data: projets } = idsProjets.length > 0
      ? await supabase.from("conception_projets").select("id, nom").in("id", idsProjets)
      : { data: [] };
    const utilisateurs = projetsUtilisantPlante(id, { elements: elements ?? [], compositions: compositions ?? [], projets: projets ?? [] });
    if (utilisateurs.length > 0) {
      return NextResponse.json({ ok: false, code: "plante_utilisee", projets: utilisateurs, error: messagePlanteUtilisee(utilisateurs) }, { status: 409 });
    }

    // Supprimer les images du storage
    const { data: plante } = await supabase.from("plantes").select("image_face_path, image_dessus_path").eq("id", id).single();
    const paths = [plante?.image_face_path, plante?.image_dessus_path].filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from("conception").remove(paths);
    // Autres fichiers de la plante (symbole, régénérations)
    await supprimerDossier(supabase, `plantes/${id}`);

    const { error } = await supabase.from("plantes").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
