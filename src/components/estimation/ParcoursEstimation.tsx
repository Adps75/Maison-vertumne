"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { DonneesEstimation, TypeLieu } from "@/lib/types/estimation";
import { nombreEtapes } from "@/lib/types/estimation";
import { EtapeTypeLieu } from "./EtapeTypeLieu";
import { EtapeAdresse } from "./EtapeAdresse";
import { EtapeCoordonnees } from "./EtapeCoordonnees";

const CLE_STORAGE = "adp_estimation";

function chargerSession(): { etape: number; donnees: DonneesEstimation } | null {
  try {
    const raw = sessionStorage.getItem(CLE_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sauverSession(etape: number, donnees: DonneesEstimation) {
  try {
    sessionStorage.setItem(CLE_STORAGE, JSON.stringify({ etape, donnees }));
  } catch {
    // sessionStorage indisponible (navigation privée, quota)
  }
}

export function ParcoursEstimation() {
  const [initialise, setInitialise] = useState(false);
  const [etape, setEtape] = useState(1);
  const [donnees, setDonnees] = useState<DonneesEstimation>({});

  // Restauration depuis sessionStorage au premier rendu
  useEffect(() => {
    const sauvegarde = chargerSession();
    if (sauvegarde) {
      setEtape(sauvegarde.etape);
      setDonnees(sauvegarde.donnees);
    }
    setInitialise(true);
  }, []);

  // Sauvegarde à chaque changement
  useEffect(() => {
    if (initialise) {
      sauverSession(etape, donnees);
    }
  }, [etape, donnees, initialise]);

  const total = nombreEtapes(donnees.typeLieu);

  const choisirTypeLieu = useCallback(
    (type: TypeLieu) => {
      if (type !== donnees.typeLieu) {
        setDonnees({ typeLieu: type });
      }
      setEtape(2);
    },
    [donnees.typeLieu],
  );

  // Attendre la restauration avant d'afficher
  if (!initialise) {
    return (
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] py-10">
          <div className="h-1 bg-paper-2 rounded-full" />
        </div>
      </main>
    );
  }

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

        {/* Étape 3 — Coordonnées */}
        {etape === 3 && (
          <EtapeCoordonnees
            donnees={donnees}
            onValider={(maj) => {
              setDonnees((prev) => ({ ...prev, ...maj }));
              setEtape(4);
            }}
            onRetour={() => setEtape(2)}
          />
        )}

        {/* Étape 4 — Placeholder photos */}
        {etape === 4 && (
          <div className="text-center py-20">
            <h2 className="font-serif font-medium text-2xl text-green-950">
              Photos à venir
            </h2>
            <button
              onClick={() => setEtape(3)}
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
