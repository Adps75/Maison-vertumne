"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";

const CanevasConception = dynamic(
  () =>
    import("@/modules/conception/composants/CanevasConception").then(
      (m) => m.CanevasConception,
    ),
  { ssr: false, loading: () => <div className="w-full h-full bg-paper-2 animate-pulse" /> },
);

interface Projet {
  id: string;
  nom: string;
  parcelles_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  batiments_geojson: {
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    hauteur: number | null;
    cleabs: string;
  }[];
  ortho_url: string | null;
  ortho_emprise: [number, number, number, number] | null;
}

export function PageProjetClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/conception/projets/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setProjet(data.projet);
        else setErreur(data.error);
      })
      .catch(() => setErreur("Impossible de charger le projet."))
      .finally(() => setChargement(false));
  }, [id]);

  const onBatimentHauteur = useCallback(
    async (cleabs: string, hauteur: number) => {
      if (!projet) return;

      // Mise à jour locale
      const batiments = projet.batiments_geojson.map((b) =>
        b.cleabs === cleabs ? { ...b, hauteur } : b,
      );
      setProjet({ ...projet, batiments_geojson: batiments });

      // Persister
      await fetch(`/api/conception/projets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batiments_geojson: batiments }),
      });
    },
    [projet, id],
  );

  // Calculer la surface
  let surface: number | null = null;
  if (projet?.parcelles_geojson) {
    surface = calculerSurface(projet.parcelles_geojson);
  }

  if (chargement) {
    return <div className="w-full h-screen bg-paper-2 animate-pulse" />;
  }

  if (erreur || !projet) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <div className="text-center">
          <p className="text-red-700">{erreur ?? "Projet introuvable."}</p>
          <Link href="/conception" className="mt-4 text-brass hover:text-brass-soft">
            &larr; Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-paper">
      <header className="border-b border-hair-light px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/conception" className="text-brass hover:text-brass-soft text-[0.82rem]">
            &larr;
          </Link>
          <span className="font-serif font-medium text-[1.1rem] text-green-950">
            {projet.nom}
          </span>
        </div>
        <form action="/api/auth/deconnexion" method="POST">
          <button type="submit" className="text-[0.78rem] text-stone hover:text-brass">
            Déconnexion
          </button>
        </form>
      </header>
      <div className="flex-1">
        <CanevasConception
          parcelles={projet.parcelles_geojson}
          batiments={projet.batiments_geojson ?? []}
          orthoUrl={projet.ortho_url}
          orthoEmprise={projet.ortho_emprise}
          surfaceParcelle={surface}
          onBatimentHauteur={onBatimentHauteur}
        />
      </div>
    </div>
  );
}

/** Calcule la surface d'un polygone/multipolygone en m² (formule du lacet). */
function calculerSurface(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const rings =
    geom.type === "MultiPolygon"
      ? geom.coordinates.map((p) => p[0])
      : [geom.coordinates[0]];

  let total = 0;
  for (const ring of rings) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    total += Math.abs(area) / 2;
  }
  return Math.round(total);
}
