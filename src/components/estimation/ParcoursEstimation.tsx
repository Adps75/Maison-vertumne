"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { DonneesEstimation, TypeLieu } from "@/lib/types/estimation";
import { nombreEtapes } from "@/lib/types/estimation";
import { EtapeTypeLieu } from "./EtapeTypeLieu";
import { EtapeAdresse } from "./EtapeAdresse";

export function ParcoursEstimation() {
  const [etape, setEtape] = useState(1);
  const [donnees, setDonnees] = useState<DonneesEstimation>({});

  const total = nombreEtapes(donnees.typeLieu);

  const choisirTypeLieu = useCallback(
    (type: TypeLieu) => {
      if (type !== donnees.typeLieu) {
        // Réinitialise les données d'adresse, parcelle et carte
        setDonnees({
          typeLieu: type,
        });
      }
      setEtape(2);
    },
    [donnees.typeLieu],
  );

  return (
    <main className="flex-1 bg-paper">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] py-10">
        {/* Barre de progression */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-[0.75rem] text-stone mb-2">
            <span>
              Étape {etape} sur {total}
            </span>
            <Link
              href="/"
              className="text-brass hover:text-brass-soft transition-colors"
            >
              Quitter
            </Link>
          </div>
          <div className="h-1 bg-paper-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-brass rounded-full transition-all duration-300"
              style={{ width: `${(etape / total) * 100}%` }}
            />
          </div>
        </div>

        {/* Étape 1 — Type de lieu */}
        {etape === 1 && <EtapeTypeLieu onChoisir={choisirTypeLieu} />}

        {/* Étape 2 — Adresse */}
        {etape === 2 && donnees.typeLieu && (
          <EtapeAdresse
            typeLieu={donnees.typeLieu}
            donnees={donnees}
            onValider={(maj) => {
              setDonnees((prev) => ({ ...prev, ...maj }));
              setEtape(3);
            }}
            onRetour={() => setEtape(1)}
          />
        )}

        {/* Étape 3+ — Placeholder */}
        {etape === 3 && (
          <div className="text-center py-20">
            <h2 className="font-serif font-medium text-2xl text-green-950">
              Étape 3 à venir
            </h2>
            <button
              onClick={() => setEtape(2)}
              className="mt-6 text-brass font-medium hover:text-brass-soft transition-colors"
            >
              &larr; Retour
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
