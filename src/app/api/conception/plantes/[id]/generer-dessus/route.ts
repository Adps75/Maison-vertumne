import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { creerFournisseurImage } from "@/modules/conception/ia";
import { promptDessus } from "@/modules/conception/ia/prompt";
import { normaliserDessus } from "@/modules/conception/ia/normalisation";
import { calculerCout } from "@/modules/conception/config/style-plantes";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: plante } = await supabase.from("plantes").select("*").eq("id", id).single();
    if (!plante) return NextResponse.json({ ok: false, error: "Plante introuvable." }, { status: 404 });

    const fournisseur = creerFournisseurImage();
    const { data: ref } = await supabase.from("plantes").select("image_dessus_path").eq("est_reference", true).neq("id", id).limit(1).single();

    let refBuffer: Buffer | undefined;
    const avecRef = !!ref?.image_dessus_path;
    if (avecRef) {
      const { data: d } = await supabase.storage.from("conception").download(ref.image_dessus_path);
      if (d) refBuffer = Buffer.from(await d.arrayBuffer());
    }

    const prompt = promptDessus(plante, avecRef);
    const res = avecRef && refBuffer ? await fournisseur.editer(prompt, refBuffer) : await fournisseur.generer(prompt);
    const norm = await normaliserDessus(res.buffer);
    const cout = calculerCout(res.usage);

    const path = `plantes/${id}/dessus.png`;
    await supabase.storage.from("conception").upload(path, norm, { contentType: "image/png", upsert: true });
    await supabase.from("plantes").update({
      image_dessus_path: path,
      cout_generation_total: (plante.cout_generation_total ?? 0) + cout,
    }).eq("id", id);

    return NextResponse.json({ ok: true, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
