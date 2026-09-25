import { NextResponse } from "next/server";
import { authentifierLead } from "@/lib/auth-lead";
import { MAX_PHOTOS } from "@/lib/validation/photos";

export async function POST() {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;

  // Vérifier la limite de 4 photos
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json(
      { ok: false, error: `Vous avez déjà ${MAX_PHOTOS} photos.` },
      { status: 400 },
    );
  }

  const photoId = crypto.randomUUID();
  const path = `leads/${leadId}/${photoId}.jpg`;

  const { data, error } = await supabase.storage
    .from("photos-jardins")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Impossible de créer l'URL d'envoi." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    signedUrl: data.signedUrl,
    path,
  });
}
