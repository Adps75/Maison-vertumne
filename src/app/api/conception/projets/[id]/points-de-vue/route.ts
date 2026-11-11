import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const { data: points, error } = await supabase
      .from("conception_points_de_vue")
      .select("*")
      .eq("projet_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Générer une URL signée pour chaque photo
    const pointsAvecUrl = await Promise.all(
      (points ?? []).map(async (pdv) => {
        let photo_url: string | null = null;
        if (pdv.photo_path) {
          const { data } = await supabase.storage
            .from("conception")
            .createSignedUrl(pdv.photo_path, 3600);
          photo_url = data?.signedUrl ?? null;
        }
        return { ...pdv, photo_url };
      }),
    );

    return NextResponse.json({ ok: true, points_de_vue: pointsAvecUrl });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;

    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;
    const nom = formData.get("nom") as string | null;
    const zone_id = formData.get("zone_id") as string | null;
    const largeur_px = Number(formData.get("largeur_px"));
    const hauteur_px = Number(formData.get("hauteur_px"));
    const exifStr = formData.get("exif") as string | null;
    const cameraStr = formData.get("camera") as string | null;
    const fov_v = Number(formData.get("fov_v"));

    if (!photo || !nom) {
      return NextResponse.json(
        { ok: false, error: "Photo et nom requis." },
        { status: 400 },
      );
    }

    // Générer un UUID pour le fichier
    const pdvId = crypto.randomUUID();
    const photoPath = `projets/${id}/points-de-vue/${pdvId}.jpg`;

    // Upload de la photo
    const buffer = Buffer.from(await photo.arrayBuffer());
    const { error: errUpload } = await supabase.storage
      .from("conception")
      .upload(photoPath, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (errUpload) {
      return NextResponse.json({ ok: false, error: errUpload.message }, { status: 500 });
    }

    // Parser les champs JSON
    const exif = exifStr ? JSON.parse(exifStr) : null;
    const camera = cameraStr ? JSON.parse(cameraStr) : { fov_v: fov_v || null };

    const { data: pdv, error: errInsert } = await supabase
      .from("conception_points_de_vue")
      .insert({
        id: pdvId,
        projet_id: id,
        zone_id: zone_id || null,
        nom,
        photo_path: photoPath,
        largeur_px,
        hauteur_px,
        exif,
        camera,
        statut: "a_caler",
      })
      .select()
      .single();

    if (errInsert) {
      // Nettoyer la photo uploadée en cas d'erreur
      await supabase.storage.from("conception").remove([photoPath]);
      return NextResponse.json({ ok: false, error: errInsert.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, point_de_vue: pdv });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("[points-de-vue] erreur:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
