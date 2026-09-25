"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { PhotoEstimation, ParcelleInfo } from "@/lib/types/estimation";

interface Props {
  photos: PhotoEstimation[];
  parcelle: ParcelleInfo;
  centre: { lat: number; lon: number };
  onMajPhoto: (id: string, maj: Partial<PhotoEstimation>) => void;
}

const CartePositionnement = dynamic(
  () =>
    import("./CartePositionnementClient").then(
      (m) => m.CartePositionnementClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] bg-paper-2 rounded animate-pulse" />
    ),
  },
);

type EtapePos = { photoId: string; etape: "depart" | "cible" } | null;

export function PhotoPositionnement({
  photos,
  parcelle,
  centre,
  onMajPhoto,
}: Props) {
  const [active, setActive] = useState<EtapePos>(null);

  const demarrerPositionnement = useCallback((photoId: string) => {
    setActive({ photoId, etape: "depart" });
  }, []);

  const onClicCarte = useCallback(
    (lat: number, lon: number) => {
      if (!active) return;

      if (active.etape === "depart") {
        // Premier clic : position du photographe
        onMajPhoto(active.photoId, { lat, lon });
        setActive({ photoId: active.photoId, etape: "cible" });
      } else {
        // Deuxième clic : direction regardée
        const photo = photos.find((p) => p.id === active.photoId);
        if (photo?.lat != null && photo?.lon != null) {
          // Import dynamique pour ne pas charger direction.ts au chargement
          import("@/lib/direction").then(({ calculerDirection }) => {
            const dir = calculerDirection(
              { lat: photo.lat!, lon: photo.lon! },
              { lat, lon },
            );
            onMajPhoto(active.photoId, { orientation_degres: dir });
          });
        }
        setActive(null);
      }
    },
    [active, photos, onMajPhoto],
  );

  return (
    <div>
      {/* Liste des photos avec statut */}
      <div className="flex flex-wrap gap-2 mb-4">
        {photos.map((photo) => {
          const positionne =
            photo.lat != null && photo.orientation_degres != null;
          const enCours = active?.photoId === photo.id;

          return (
            <button
              key={photo.id}
              onClick={() => demarrerPositionnement(photo.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-[0.82rem] border transition-colors ${
                enCours
                  ? "border-brass bg-brass/10 text-brass"
                  : positionne
                    ? "border-green-600/30 bg-green-600/5 text-green-800"
                    : "border-hair-light text-stone hover:border-brass"
              }`}
            >
              <span className="bg-brass text-paper text-[0.65rem] w-4 h-4 flex items-center justify-center rounded-full">
                {photo.ordre}
              </span>
              {positionne ? "Repositionner" : "Positionner"}
            </button>
          );
        })}
      </div>

      {/* Consigne */}
      {active && (
        <p className="mb-3 text-[0.88rem] text-brass font-medium">
          Photo {photos.find((p) => p.id === active.photoId)?.ordre} :{" "}
          {active.etape === "depart"
            ? "Touchez l'endroit où vous étiez."
            : "Touchez ce que vous photographiez."}
        </p>
      )}

      <CartePositionnement
        centre={centre}
        parcelle={parcelle}
        photos={photos}
        onClicCarte={onClicCarte}
      />
    </div>
  );
}
