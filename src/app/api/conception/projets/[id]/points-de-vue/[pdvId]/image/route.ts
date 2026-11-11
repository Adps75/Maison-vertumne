import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; pdvId: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;

    const { data: pdv } = await supabase
      .from("conception_points_de_vue")
      .select("photo_path")
      .eq("id", pdvId)
      .eq("projet_id", id)
      .single();

    if (!pdv?.photo_path) {
      return NextResponse.json({ error: "Image absente." }, { status: 404 });
    }

    const { data, error } = await supabase.storage
      .from("conception")
      .download(pdv.photo_path);

    if (error || !data) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
