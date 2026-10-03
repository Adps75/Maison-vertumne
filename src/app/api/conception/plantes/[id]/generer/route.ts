import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { creerFournisseurImage } from "@/modules/conception/ia";
import { promptFace, promptDessus } from "@/modules/conception/ia/prompt";
import { normaliserFace, normaliserDessus } from "@/modules/conception/ia/normalisation";
import { calculerCout } from "@/modules/conception/config/style-plantes";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: plante } = await supabase.from("plantes").select("*").eq("id", id).single();
    if (!plante) return NextResponse.json({ ok: false, error: "Plante introuvable." }, { status: 404 });

    const fournisseur = creerFournisseurImage();

    // Chercher la plante de référence pour le style
    const { data: reference } = await supabase
      .from("plantes")
      .select("image_face_path, image_dessus_path")
      .eq("est_reference", true)
      .neq("id", id)
      .limit(1)
      .single();

    let refFaceBuffer: Buffer | undefined;
    let refDessusBuffer: Buffer | undefined;
    const avecRef = !!reference?.image_face_path;

    if (avecRef) {
      const { data: faceData } = await supabase.storage.from("conception").download(reference.image_face_path);
      if (faceData) refFaceBuffer = Buffer.from(await faceData.arrayBuffer());
      if (reference.image_dessus_path) {
        const { data: dessusData } = await supabase.storage.from("conception").download(reference.image_dessus_path);
        if (dessusData) refDessusBuffer = Buffer.from(await dessusData.arrayBuffer());
      }
    }

    let coutTotal = plante.cout_generation_total ?? 0;

    // Vue de face
    const pFace = promptFace(plante, avecRef);
    const resFace = avecRef && refFaceBuffer
      ? await fournisseur.editer(pFace, refFaceBuffer)
      : await fournisseur.generer(pFace);
    const { buffer: faceNorm } = await normaliserFace(resFace.buffer);
    coutTotal += calculerCout(resFace.usage);

    // Sauvegarder la face immédiatement
    const facePath = `plantes/${id}/face.png`;
    await supabase.storage.from("conception").upload(facePath, faceNorm, { contentType: "image/png", upsert: true });
    await supabase.from("plantes").update({
      image_face_path: facePath,
      cout_generation_total: Math.round(coutTotal * 10000) / 10000,
    }).eq("id", id);

    // Vue de dessus (indépendante — si elle échoue, la face est déjà sauvée)
    const pDessus = promptDessus(plante, avecRef);
    const resDessus = avecRef && refDessusBuffer
      ? await fournisseur.editer(pDessus, refDessusBuffer)
      : await fournisseur.generer(pDessus);
    const dessusNorm = await normaliserDessus(resDessus.buffer);
    coutTotal += calculerCout(resDessus.usage);

    const dessusPath = `plantes/${id}/dessus.png`;
    await supabase.storage.from("conception").upload(dessusPath, dessusNorm, { contentType: "image/png", upsert: true });
    await supabase.from("plantes").update({
      image_dessus_path: dessusPath,
      cout_generation_total: Math.round(coutTotal * 10000) / 10000,
      statut: "validee",
    }).eq("id", id);

    return NextResponse.json({ ok: true, cout: coutTotal });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
