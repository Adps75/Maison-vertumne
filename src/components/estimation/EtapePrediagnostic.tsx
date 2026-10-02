"use client";

import { useState } from "react";
import type { DonneesEstimation } from "@/lib/types/estimation";

interface Props {
  donnees: DonneesEstimation;
}

const CRENEAUX = [
  { code: "semaine_matin", libelle: "En semaine, le matin" },
  { code: "semaine_apres_midi", libelle: "En semaine, l'après-midi" },
  { code: "semaine_soir", libelle: "En semaine, après 18 h" },
  { code: "samedi", libelle: "Le samedi" },
];

export function EtapePrediagnostic({ donnees }: Props) {
  const [rappelDemande, setRappelDemande] = useState(false);
  const [creneau, setCreneau] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [confirme, setConfirme] = useState(false);

  const demanderRappel = async () => {
    if (!creneau) return;
    setEnCours(true);

    try {
      // Enregistrer le rappel
      await fetch("/api/leads/courant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rappel_souhaite: true,
          creneau_rappel: creneau,
          etape_atteinte: 8,
        }),
      });

      // Recalculer le score (+10 fiabilité pour l'engagement)
      await fetch("/api/leads/courant/score", { method: "POST" });

      setConfirme(true);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Votre pré-diagnostic
      </h1>

      <p className="mt-4 text-[1.05rem] text-ink leading-relaxed">
        Votre pré-diagnostic arrive par email dans quelques minutes, à l'adresse{" "}
        <span className="font-medium">{donnees.email}</span>.
      </p>

      {/* Diagnostic sur place */}
      <div className="mt-10 p-8 bg-green-950 text-paper rounded">
        <h2 className="font-serif font-medium text-[clamp(1.5rem,3vw,2rem)]">
          Allons plus loin, chez vous
        </h2>
        <ul className="mt-4 space-y-2 text-[0.95rem] text-celadon">
          <li>Visite de votre extérieur</li>
          <li>Analyse du sol et de l'exposition</li>
          <li>Premières orientations d'aménagement</li>
          <li>Esquisse et devis</li>
        </ul>
        <p className="mt-4 text-[1.1rem] text-paper font-medium">
          190 € · Acompte de 50 € à la réservation
        </p>
        <p className="mt-1 text-[0.85rem] text-celadon/80">
          Déduit si vous poursuivez avec nous.
        </p>
        <button
          className="mt-6 px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors"
          onClick={() => alert("Réservation bientôt disponible")}
        >
          Réserver mon diagnostic
        </button>
      </div>

      {/* Rappel */}
      <div className="mt-10 border-t border-hair-light pt-8">
        {!rappelDemande && !confirme && (
          <button
            onClick={() => setRappelDemande(true)}
            className="text-brass font-medium hover:text-brass-soft transition-colors"
          >
            Je préfère être rappelé
          </button>
        )}

        {rappelDemande && !confirme && (
          <div>
            <p className="font-medium text-ink mb-3">
              Quand préférez-vous être rappelé ?
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CRENEAUX.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCreneau(c.code)}
                  className={`px-4 py-2.5 rounded-full text-[0.85rem] border transition-colors ${
                    creneau === c.code
                      ? "bg-brass text-paper border-brass"
                      : "bg-white text-ink border-hair-light hover:border-brass"
                  }`}
                >
                  {c.libelle}
                </button>
              ))}
            </div>
            <button
              disabled={!creneau || enCours}
              onClick={demanderRappel}
              className="px-6 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enCours ? "Envoi…" : "Confirmer"}
            </button>
          </div>
        )}

        {confirme && (
          <div className="p-4 bg-paper-2 border border-hair-light rounded">
            <p className="text-ink font-medium">
              C'est noté, nous vous rappellerons{" "}
              {CRENEAUX.find((c) => c.code === creneau)?.libelle.toLowerCase()}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
