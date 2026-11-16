import { NextResponse } from "next/server";
import sharp from "sharp";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { enregistrerTexture } from "@/modules/conception/serveur/textures";

const BUCKET = "conception";

/** Texture répétable d'un matériau (JPEG). */
export async function GET(_request: Request, { params }: { params: Promise<{ materiauId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { materiauId } = await params;
    const { data: m } = await supabase.from("materiaux").select("texture_path").eq("id", materiauId).single();
    if (!m?.texture_path) return NextResponse.json({ ok: false, error: "Aucune texture." }, { status: 404 });
    const { data, error } = await supabase.storage.from(BUCKET).download(m.texture_path);
    if (error || !data) return NextResponse.json({ ok: false, error: "Texture absente." }, { status: 404 });
    return new NextResponse(new Uint8Array(await data.arrayBuffer()), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

/** Remplace la texture par une image déposée (supposée répétable), 1024 px au plus. */
export async function POST(request: Request, { params }: { params: Promise<{ materiauId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { materiauId } = await params;
    const form = await request.formData().catch(() => null);
    const fichier = form?.get("image");
    if (!(fichier instanceof Blob) || fichier.size === 0) return NextResponse.json({ ok: false, error: "Aucune image reçue." }, { status: 400 });
    let jpeg: Buffer;
    try {
      jpeg = await sharp(Buffer.from(await fichier.arrayBuffer())).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    } catch {
      return NextResponse.json({ ok: false, error: "Format d'image non reconnu." }, { status: 415 });
    }
    return enregistrerTexture(supabase, materiauId, jpeg);
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
