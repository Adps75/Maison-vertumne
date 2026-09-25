import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Route disponible uniquement en développement." }, { status: 403 });
  }

  // Import dynamique pour éviter le bundling en production
  const { genererImageAerienne } = await import("@/lib/aerienne");

  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Paramètres lat et lon requis. Exemple : /api/dev/aerienne?lat=48.7811&lon=2.2629" },
      { status: 400 },
    );
  }

  // Récupérer la parcelle d'abord
  const geom = JSON.stringify({
    type: "Point",
    coordinates: [parseFloat(lon), parseFloat(lat)],
  });

  try {
    const parcelleRes = await fetch(
      `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}&_limit=1`,
    );
    const parcelleData = await parcelleRes.json();
    const feature = parcelleData.features?.[0];

    if (!feature) {
      return NextResponse.json({ error: "Aucune parcelle trouvée." }, { status: 404 });
    }

    const imageBuffer = await genererImageAerienne(feature.geometry);

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
