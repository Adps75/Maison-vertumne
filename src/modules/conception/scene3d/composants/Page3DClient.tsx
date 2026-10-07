"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preparerDonneesScene, type ProjetPour3D } from "../preparer-donnees";
import type { DonneesScene3D } from "../types";
import type { Element } from "../../types";
import type { Scene3DRef } from "./Scene3D";

// Import dynamique de Scene3D (WebGL, pas de SSR)
const Scene3DDynamic = dynamic(
  () => import("./Scene3D").then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-stone-900 flex items-center justify-center text-stone-400">
        Chargement de la vue 3D…
      </div>
    ),
  },
);

interface ZoneOption {
  id: string;
  nom: string;
}

export function Page3DClient() {
  const { id } = useParams<{ id: string }>();
  const sceneRef = useRef<Scene3DRef>(null);

  const [projet, setProjet] = useState<ProjetPour3D | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);

  // Charger les données du projet
  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`/api/conception/projets/${id}`).then((r) => r.json()),
      fetch(`/api/conception/projets/${id}/elements`).then((r) => r.json()),
    ])
      .then(([projetData, elementsData]) => {
        if (!projetData.ok) throw new Error(projetData.erreur ?? "Projet introuvable");
        setProjet({
          parcelles_geojson: projetData.projet.parcelles_geojson,
          batiments_geojson: projetData.projet.batiments_geojson ?? [],
          ortho_url: projetData.projet.ortho_url ?? null,
          ortho_emprise: projetData.projet.ortho_emprise ?? null,
        });
        setElements(elementsData.elements ?? []);
      })
      .catch((err) => setErreur(err.message))
      .finally(() => setChargement(false));
  }, [id]);

  // Extraire les zones disponibles
  const zones: ZoneOption[] = useMemo(
    () =>
      elements
        .filter((el) => el.type === "zone")
        .map((el) => ({
          id: el.id,
          nom: (el.proprietes.nom as string) ?? "Zone sans nom",
        })),
    [elements],
  );

  // Préparer les données 3D
  const donnees: DonneesScene3D | null = useMemo(() => {
    if (!projet) return null;
    return preparerDonneesScene(projet, elements, zoneId);
  }, [projet, elements, zoneId]);

  if (chargement) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-900 text-stone-400">
        Chargement…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-900 text-red-400">
        Erreur : {erreur}
      </div>
    );
  }

  if (!donnees) return null;

  return (
    <div className="h-screen flex flex-col bg-stone-900">
      {/* Barre supérieure */}
      <div className="flex items-center gap-4 px-4 py-2 bg-stone-800 text-stone-200 text-sm shrink-0">
        <Link
          href={`/conception/${id}`}
          className="hover:text-white transition-colors"
        >
          ← Retour au plan
        </Link>

        <div className="flex-1" />

        {zones.length > 0 && (
          <select
            value={zoneId ?? ""}
            onChange={(e) => setZoneId(e.target.value || null)}
            className="bg-stone-700 text-stone-200 rounded px-2 py-1 text-sm"
            data-testid="selecteur-zone"
          >
            <option value="">Tout le jardin</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nom}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => sceneRef.current?.vuePieton()}
          className="bg-stone-700 hover:bg-stone-600 text-stone-200 rounded px-3 py-1 text-sm transition-colors"
          data-testid="btn-vue-pieton"
        >
          Vue piéton
        </button>
      </div>

      {/* Canvas 3D */}
      <div className="flex-1 min-h-0" data-testid="conteneur-3d">
        <Scene3DDynamic ref={sceneRef} donnees={donnees} />
      </div>
    </div>
  );
}
