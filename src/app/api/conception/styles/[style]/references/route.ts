import { NextResponse } from "next/server";
import sharp from "sharp";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { STYLES, MAX_REFERENCES, type StyleProjet } from "@/modules/conception/rendu/styles";
import { BUCKET, cheminReference, referencesActives } from "@/modules/conception/serveur/rendus-stockage";

const TAILLE_MAX_OCTETS = 15 * 1024 * 1024;

/** Dépose une image de référence pour un style (3 au plus par style). */
export async function POST(request: Request, { params }: { params: Promise<{ style: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { style } = await params;
    if (!STYLES.includes(style as StyleProjet)) return NextResponse.json({ ok: false, error: "Style inconnu." }, { status: 404 });
    const actives = await referencesActives(supabase, style as StyleProjet);
    if (actives.length >= MAX_REFERENCES) {
      return NextResponse.json({ ok: false, code: "references_completes", error: `${MAX_REFERENCES} références au plus par style : retirez-en une avant d'en ajouter.` }, { status: 409 });
    }
    const form = await request.formData().catch(() => null);
    const fichier = form?.get("image");
    if (!(fichier instanceof Blob) || fichier.size === 0) return NextResponse.json({ ok: false, error: "Aucune image reçue." }, { status: 400 });
    if (fichier.size > TAILLE_MAX_OCTETS) return NextResponse.json({ ok: false, error: "Image trop lourde (15 Mo au plus)." }, { status: 413 });

    // Normalisée : orientation appliquée, 1536 px au plus, PNG
    let png: Buffer;
    try {
      png = await sharp(Buffer.from(await fichier.arrayBuffer())).rotate()
        .resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    } catch {
      return NextResponse.json({ ok: false, error: "Format d'image non reconnu (JPEG, PNG ou WebP)." }, { status: 415 });
    }
    const id = crypto.randomUUID();
    const path = cheminReference(style as StyleProjet, id);
    const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
    if (e1) return NextResponse.json({ ok: false, error: `Enregistrement impossible : ${e1.message}` }, { status: 500 });
    const { error: e2 } = await supabase.from("conception_styles_references").insert({ id, style, path });
    if (e2) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, reference: { id } });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
