import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { creerFournisseurImage } from "@/modules/conception/ia";
import { calculerCout } from "@/modules/conception/config/style-plantes";
import { consigneTexture, rendreRepetable } from "@/modules/conception/materiaux/texture";
import { enregistrerTexture } from "@/modules/conception/serveur/textures";

export const maxDuration = 120;

/** Génère la texture d'un matériau de surface (vue du dessus), puis la rend répétable. */
export async function POST(_request: Request, { params }: { params: Promise<{ materiauId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { materiauId } = await params;
    const { data: m } = await supabase.from("materiaux").select("id, type, description_ia, texture_taille_m").eq("id", materiauId).single();
    if (!m) return NextResponse.json({ ok: false, error: "Matériau introuvable." }, { status: 404 });
    if (m.type !== "surface") return NextResponse.json({ ok: false, error: "Texture réservée aux matériaux de surface." }, { status: 400 });
    const r = await creerFournisseurImage().generer(consigneTexture({ description_ia: m.description_ia, texture_taille_m: m.texture_taille_m == null ? null : Number(m.texture_taille_m) }), { taille: "1024x1024", qualite: "medium" });
    const reponse = await enregistrerTexture(supabase, materiauId, await rendreRepetable(r.buffer));
    const corps = await reponse.json();
    return NextResponse.json({ ...corps, cout: calculerCout(r.usage) }, { status: reponse.status });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[materiaux] texture :", e);
    return NextResponse.json({ ok: false, error: `Génération impossible : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}` }, { status: 502 });
  }
}
