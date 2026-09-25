import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Paramètres lat et lon requis." },
      { status: 400 },
    );
  }

  const geom = JSON.stringify({
    type: "Point",
    coordinates: [parseFloat(lon), parseFloat(lat)],
  });

  try {
    const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}&_limit=1`;
    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erreur du service cadastral." },
        { status: 502 },
      );
    }

    const data = await res.json();
    const features = data.features ?? [];

    if (features.length === 0) {
      return NextResponse.json(
        { error: "Aucune parcelle trouvée à cet emplacement." },
        { status: 404 },
      );
    }

    const feature = features[0];
    return NextResponse.json({
      geometry: feature.geometry,
      contenance: feature.properties.contenance ?? 0,
      section: feature.properties.section ?? "",
      numero: feature.properties.numero ?? "",
      commune: feature.properties.nom_com ?? "",
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de contacter le service cadastral." },
      { status: 502 },
    );
  }
}
