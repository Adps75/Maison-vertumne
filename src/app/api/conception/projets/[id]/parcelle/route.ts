import { NextRequest, NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import {
  geometrieWgs84VersL93,
  versRelatif,
} from "@/modules/conception/geo/projection";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    const { lat, lon } = await request.json();

    if (!lat || !lon) {
      return NextResponse.json({ ok: false, error: "lat et lon requis." }, { status: 400 });
    }

    // Récupérer le projet pour l'origine
    const { data: projet } = await supabase
      .from("conception_projets")
      .select("origine_l93, parcelles_geojson")
      .eq("id", id)
      .single();

    if (!projet) {
      return NextResponse.json({ ok: false, error: "Projet introuvable." }, { status: 404 });
    }

    const origine = { x: projet.origine_l93[0], y: projet.origine_l93[1] };

    // Chercher la parcelle
    const geom = JSON.stringify({
      type: "Point",
      coordinates: [parseFloat(lon), parseFloat(lat)],
    });
    const res = await fetch(
      `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}&_limit=1`,
    );
    const data = await res.json();
    const parcelle = data.features?.[0];

    if (!parcelle) {
      return NextResponse.json({ ok: false, error: "Aucune parcelle trouvée." }, { status: 404 });
    }

    const parcelleL93 = geometrieWgs84VersL93(parcelle.geometry);
    const parcelleRelative = versRelatif(parcelleL93, origine);

    // Fusionner avec les parcelles existantes (MultiPolygon)
    const existantes = projet.parcelles_geojson;
    let nouvelleParcelles: GeoJSON.MultiPolygon;

    if (existantes?.type === "MultiPolygon") {
      const coords =
        parcelleRelative.type === "MultiPolygon"
          ? parcelleRelative.coordinates
          : [parcelleRelative.coordinates];
      nouvelleParcelles = {
        type: "MultiPolygon",
        coordinates: [...existantes.coordinates, ...coords],
      };
    } else if (existantes?.type === "Polygon") {
      const coords =
        parcelleRelative.type === "MultiPolygon"
          ? parcelleRelative.coordinates
          : [parcelleRelative.coordinates];
      nouvelleParcelles = {
        type: "MultiPolygon",
        coordinates: [existantes.coordinates, ...coords],
      };
    } else {
      nouvelleParcelles =
        parcelleRelative.type === "MultiPolygon"
          ? parcelleRelative
          : { type: "MultiPolygon", coordinates: [parcelleRelative.coordinates] };
    }

    const { error } = await supabase
      .from("conception_projets")
      .update({ parcelles_geojson: nouvelleParcelles })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, parcelles: nouvelleParcelles });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
