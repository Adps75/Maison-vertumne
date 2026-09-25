import { NextResponse } from "next/server";
import { authentifierLead } from "@/lib/auth-lead";
import {
  schemaPhotoEnregistrement,
  cheminAppartientAuLead,
} from "@/lib/validation/photos";

export async function GET() {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;

  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, path, ordre, lat, lon, orientation_degres, legende")
    .eq("lead_id", leadId)
    .order("ordre");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Générer des URLs de lecture signées (60 min)
  const avecUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      const { data } = await supabase.storage
        .from("photos-jardins")
        .createSignedUrl(photo.path, 3600);
      return { ...photo, url: data?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ ok: true, photos: avecUrls });
}

export async function POST(request: Request) {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;
  const body = await request.json();
  const parsed = schemaPhotoEnregistrement.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Données invalides.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { path, ordre, lat, lon, orientation_degres, legende } = parsed.data;

  // Vérifier que le chemin appartient au lead
  if (!cheminAppartientAuLead(path, leadId)) {
    return NextResponse.json(
      { ok: false, error: "Le chemin ne correspond pas à ce lead." },
      { status: 403 },
    );
  }

  // Vérifier que le fichier existe dans le bucket
  const { data: fichier } = await supabase.storage
    .from("photos-jardins")
    .list(`leads/${leadId}`, {
      search: path.split("/").pop()!,
    });

  if (!fichier || fichier.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Le fichier n'existe pas dans le bucket." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("photos")
    .insert({
      lead_id: leadId,
      path,
      ordre,
      lat: lat ?? null,
      lon: lon ?? null,
      orientation_degres: orientation_degres ?? null,
      legende: legende ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: Request) {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;
  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("id");

  if (!photoId) {
    return NextResponse.json(
      { ok: false, error: "Paramètre id requis." },
      { status: 400 },
    );
  }

  // Vérifier que la photo appartient au lead
  const { data: photo } = await supabase
    .from("photos")
    .select("id, path, ordre")
    .eq("id", photoId)
    .eq("lead_id", leadId)
    .single();

  if (!photo) {
    return NextResponse.json(
      { ok: false, error: "Photo introuvable." },
      { status: 404 },
    );
  }

  // Supprimer le fichier Storage
  await supabase.storage.from("photos-jardins").remove([photo.path]);

  // Supprimer la ligne
  await supabase.from("photos").delete().eq("id", photoId);

  // Renumeroter les photos restantes
  const { data: restantes } = await supabase
    .from("photos")
    .select("id")
    .eq("lead_id", leadId)
    .order("ordre");

  if (restantes) {
    for (let i = 0; i < restantes.length; i++) {
      await supabase
        .from("photos")
        .update({ ordre: i + 1 })
        .eq("id", restantes[i].id);
    }
  }

  return NextResponse.json({ ok: true });
}
