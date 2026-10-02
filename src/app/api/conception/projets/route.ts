import { NextRequest, NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import {
  wgs84VersL93,
  geometrieWgs84VersL93,
  calculerOrigine,
  versRelatif,
} from "@/modules/conception/geo/projection";
import { recupererBatiments } from "@/modules/conception/serveur/batiments";
import { recupererOrthophoto } from "@/modules/conception/serveur/orthophoto";

export async function GET() {
  try {
    const { supabase } = await exigerAdmin("api");

    const { data, error } = await supabase
      .from("conception_projets")
      .select("id, nom, adresse, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, projets: data });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await exigerAdmin("api");
    const body = await request.json();

    const { nom, lat, lon, lead_id } = body;

    if (!lat || !lon) {
      return NextResponse.json({ ok: false, error: "Coordonnées requises." }, { status: 400 });
    }

    // 1. Parcelle via API Carto
    const geom = JSON.stringify({
      type: "Point",
      coordinates: [parseFloat(lon), parseFloat(lat)],
    });
    const parcelleRes = await fetch(
      `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}&_limit=1`,
    );
    const parcelleData = await parcelleRes.json();
    const parcelle = parcelleData.features?.[0];

    if (!parcelle) {
      return NextResponse.json({ ok: false, error: "Aucune parcelle trouvée." }, { status: 404 });
    }

    // 2. Convertir en Lambert 93
    const parcelleL93 = geometrieWgs84VersL93(parcelle.geometry);
    const origine = calculerOrigine(parcelleL93);
    const parcelleRelative = versRelatif(parcelleL93, origine);

    // 3. Emprise de la parcelle en L93 absolu
    const emprise = calculerEmprise(parcelleL93);

    // 4. Bâtiments
    const batimentsRaw = await recupererBatiments(emprise, 15, origine);
    const batiments = batimentsRaw.map((b) => ({
      geometry: b.geometry,
      hauteur: b.hauteur,
      cleabs: b.cleabs,
    }));

    // 5. Orthophoto
    const ortho = await recupererOrthophoto(emprise, 15);
    const orthoPath = `projets/${crypto.randomUUID()}/orthophoto.jpg`;

    await supabase.storage
      .from("conception")
      .upload(orthoPath, ortho.buffer, { contentType: "image/jpeg" });

    // Emprise de l'ortho en relatif
    const orthoEmprise = {
      xMin: ortho.emprise.xMin - origine.x,
      yMin: ortho.emprise.yMin - origine.y,
      xMax: ortho.emprise.xMax - origine.x,
      yMax: ortho.emprise.yMax - origine.y,
    };

    // 6. Créer le projet
    const { data: projet, error } = await supabase
      .from("conception_projets")
      .insert({
        lead_id: lead_id ?? null,
        nom: nom || "Nouveau projet",
        adresse: body.adresse ?? null,
        origine_l93: [origine.x, origine.y],
        parcelles_geojson: parcelleRelative,
        batiments_geojson: batiments,
        ortho_path: orthoPath,
        ortho_emprise: [orthoEmprise.xMin, orthoEmprise.yMin, orthoEmprise.xMax, orthoEmprise.yMax],
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: projet.id });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("[conception/projets] erreur:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function calculerEmprise(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const rings = geom.type === "MultiPolygon" ? geom.coordinates.flat(1) : geom.coordinates;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
  }
  return { xMin, yMin, xMax, yMax };
}
