import { NextResponse } from "next/server";
import { authentifierLead } from "@/lib/auth-lead";
import { schemaPhotoPatch } from "@/lib/validation/photos";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authentifierLead();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { supabase, leadId } = auth;
  const { id: photoId } = await params;

  // Vérifier que la photo appartient au lead
  const { data: photo } = await supabase
    .from("photos")
    .select("id")
    .eq("id", photoId)
    .eq("lead_id", leadId)
    .single();

  if (!photo) {
    return NextResponse.json(
      { ok: false, error: "Photo introuvable." },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = schemaPhotoPatch.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Données invalides.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("photos")
    .update(parsed.data)
    .eq("id", photoId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
