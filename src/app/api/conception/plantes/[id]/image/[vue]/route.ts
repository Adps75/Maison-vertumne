import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; vue: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, vue } = await params;

    if (vue !== "face" && vue !== "dessus") {
      return NextResponse.json({ error: "Vue invalide." }, { status: 400 });
    }

    const { data: plante } = await supabase
      .from("plantes")
      .select("image_face_path, image_dessus_path")
      .eq("id", id)
      .single();

    const path = vue === "face"
      ? (plante as Record<string, unknown>)?.image_face_path as string | null
      : (plante as Record<string, unknown>)?.image_dessus_path as string | null;
    if (!path) {
      return NextResponse.json({ error: "Image absente." }, { status: 404 });
    }

    const { data, error } = await supabase.storage
      .from("conception")
      .download(path);

    if (error || !data) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
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
