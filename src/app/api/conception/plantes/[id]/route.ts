import { NextRequest, NextResponse } from "next/server";
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

    // Supprimer les images du storage
    const { data: plante } = await supabase.from("plantes").select("image_face_path, image_dessus_path").eq("id", id).single();
    const paths = [plante?.image_face_path, plante?.image_dessus_path].filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from("conception").remove(paths);

    const { error } = await supabase.from("plantes").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
