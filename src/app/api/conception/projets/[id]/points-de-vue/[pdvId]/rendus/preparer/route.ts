import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { BUCKET, chargerPointDeVue, cheminsRendu, schemaPreparation } from "@/modules/conception/serveur/rendus-stockage";

type Params = Promise<{ id: string; pdvId: string }>;

/**
 * Réserve un rendu et renvoie des URL d'envoi signées pour les couches capturées
 * par le navigateur (envoi direct au stockage, sans passer par la fonction serveur).
 */
export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, pdvId } = await params;
    const corps = schemaPreparation.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Style invalide." }, { status: 400 });
    if (!(await chargerPointDeVue(supabase, id, pdvId))) {
      return NextResponse.json({ ok: false, error: "Point de vue introuvable." }, { status: 404 });
    }

    const renduId = crypto.randomUUID();
    const chemins = cheminsRendu(id, renduId);
    const aSigner = corps.data.style === "realiste" ? [chemins.couche, chemins.masqueScene] : [chemins.couche];

    const envois: { path: string; token: string }[] = [];
    for (const path of aSigner) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Envoi impossible." }, { status: 500 });
      envois.push({ path: data.path, token: data.token });
    }

    return NextResponse.json({ ok: true, renduId, couche: envois[0], masqueScene: envois[1] ?? null });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
