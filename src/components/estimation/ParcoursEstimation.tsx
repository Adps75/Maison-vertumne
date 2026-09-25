"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { DonneesEstimation, TypeLieu } from "@/lib/types/estimation";
import { nombreEtapes } from "@/lib/types/estimation";
import { EtapeTypeLieu } from "./EtapeTypeLieu";
import { EtapeAdresse } from "./EtapeAdresse";
import { EtapeCoordonnees } from "./EtapeCoordonnees";
import { EtapePhotos } from "./EtapePhotos";
import { EtapeProjet } from "./EtapeProjet";
import { EtapePrecisions } from "./EtapePrecisions";
import { EtapeEstimation } from "./EtapeEstimation";

const CLE_STORAGE = "adp_estimation";

interface EtatParcours {
  etape: number;
  typeLieu: TypeLieu | null;
  donnees: DonneesEstimation;
}

function chargerSession(): EtatParcours | null {
  try {
    const raw = sessionStorage.getItem(CLE_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sauverSession(etat: EtatParcours) {
  try {
    sessionStorage.setItem(CLE_STORAGE, JSON.stringify(etat));
  } catch {
    // sessionStorage indisponible
  }
}

function effacerSession() {
  try {
    sessionStorage.removeItem(CLE_STORAGE);
  } catch {
    // sessionStorage indisponible
  }
}

export function ParcoursEstimation() {
  const [initialise, setInitialise] = useState(false);
  const [choixReprise, setChoixReprise] = useState<EtatParcours | null>(null);
  const [etape, setEtape] = useState(1);
  const [typeLieu, setTypeLieu] = useState<TypeLieu | null>(null);
  const [donnees, setDonnees] = useState<DonneesEstimation>({});

  // Restauration depuis sessionStorage au premier rendu
  useEffect(() => {
    const sauvegarde = chargerSession();
    if (sauvegarde && sauvegarde.etape > 1) {
      // Parcours en cours → proposer le choix
      setChoixReprise(sauvegarde);
    }
    setInitialise(true);
  }, []);

  // Sauvegarde à chaque changement (seulement si le parcours est actif)
  useEffect(() => {
    if (initialise && !choixReprise) {
      sauverSession({ etape, typeLieu, donnees });
    }
  }, [etape, typeLieu, donnees, initialise, choixReprise]);

  const total = nombreEtapes(typeLieu ?? undefined);

  const recommencer = useCallback(() => {
    effacerSession();
    setChoixReprise(null);
    setEtape(1);
    setTypeLieu(null);
    setDonnees({});
  }, []);

  const reprendre = useCallback(() => {
    if (!choixReprise) return;
    setEtape(choixReprise.etape);
    setTypeLieu(choixReprise.typeLieu);
    setDonnees(choixReprise.donnees);
    setChoixReprise(null);
  }, [choixReprise]);

  const choisirTypeLieu = useCallback(
    (type: TypeLieu) => {
      if (type !== typeLieu) {
        setTypeLieu(type);
        setDonnees({ typeLieu: type });
      }
      setEtape(2);
    },
    [typeLieu],
  );

  const [confirmRecommencer, setConfirmRecommencer] = useState(false);

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

  // Écran de choix : reprendre ou recommencer
  if (choixReprise) {
    const avance = choixReprise.etape >= 7;
    return (
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] py-10">
          <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
            Vous avez une estimation en cours
          </h1>
          <p className="mt-3 text-stone text-[0.95rem]">
            Vous étiez à l'étape {choixReprise.etape} sur{" "}
            {nombreEtapes(choixReprise.typeLieu ?? undefined)}.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {avance ? (
              <>
                <button
                  onClick={recommencer}
                  className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors"
                >
                  Commencer une nouvelle estimation
                </button>
                <button
                  onClick={reprendre}
                  className="px-8 py-3 border border-hair-light text-ink font-medium rounded hover:border-brass transition-colors"
                >
                  Reprendre mon estimation
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={reprendre}
                  className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors"
                >
                  Reprendre mon estimation
                </button>
                <button
                  onClick={recommencer}
                  className="px-8 py-3 border border-hair-light text-ink font-medium rounded hover:border-brass transition-colors"
                >
                  Commencer une nouvelle estimation
                </button>
              </>
            )}
          </div>
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
            <div className="flex items-center gap-4">
              <span>
                Étape {etape} sur {total}
              </span>
              {etape > 1 && (
                <>
                  {!confirmRecommencer ? (
                    <button
                      onClick={() => setConfirmRecommencer(true)}
                      className="text-stone/60 hover:text-brass transition-colors"
                    >
                      Recommencer
                    </button>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-ink">Recommencer ?</span>
                      <button
                        onClick={() => {
                          setConfirmRecommencer(false);
                          recommencer();
                        }}
                        className="text-brass font-medium hover:text-brass-soft"
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => setConfirmRecommencer(false)}
                        className="text-stone hover:text-ink"
                      >
                        Non
                      </button>
                    </span>
                  )}
                </>
              )}
            </div>
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
        {etape === 2 && typeLieu && (
          <EtapeAdresse
            typeLieu={typeLieu}
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

        {/* Étape 4 — Photos */}
        {etape === 4 && typeLieu && (
          <EtapePhotos
            typeLieu={typeLieu}
            donnees={donnees}
            onValider={(maj) => {
              setDonnees((prev) => ({ ...prev, ...maj }));
              setEtape(5);
            }}
            onRetour={() => setEtape(3)}
          />
        )}

        {/* Étape 5 — Votre projet */}
        {etape === 5 && typeLieu && (
          <EtapeProjet
            key={`projet-${typeLieu}`}
            typeLieu={typeLieu}
            donnees={donnees}
            onValider={(maj) => {
              setDonnees((prev) => ({ ...prev, ...maj }));
              setEtape(6);
            }}
            onRetour={() => setEtape(4)}
          />
        )}

        {/* Étape 6 — Précisions */}
        {etape === 6 && (
          <EtapePrecisions
            donnees={donnees}
            onValider={(maj) => {
              setDonnees((prev) => ({ ...prev, ...maj }));
              setEtape(7);
            }}
            onRetour={() => setEtape(5)}
          />
        )}

        {/* Étape 7 — Estimation */}
        {etape === 7 && (
          <EtapeEstimation
            donnees={donnees}
            onValider={() => setEtape(8)}
            onRetour={() => setEtape(6)}
          />
        )}

        {/* Étape 8 — Placeholder pré-diagnostic */}
        {etape === 8 && (
          <div className="text-center py-20">
            <h2 className="font-serif font-medium text-2xl text-green-950">
              Pré-diagnostic et réservation du diagnostic, à venir
            </h2>
            <button
              onClick={() => setEtape(7)}
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
