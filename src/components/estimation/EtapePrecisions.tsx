"use client";

import { useState } from "react";
import type { DonneesEstimation } from "@/lib/types/estimation";
import { schemaPrecisions } from "@/lib/validation/projet";

interface Props {
  donnees: DonneesEstimation;
  onValider: (maj: Partial<DonneesEstimation>) => void;
  onRetour: () => void;
}

const OPTIONS_BUDGET = [
  { code: "moins_5k", libelle: "Moins de 5 000 €" },
  { code: "5k_15k", libelle: "5 000 à 15 000 €" },
  { code: "15k_40k", libelle: "15 000 à 40 000 €" },
  { code: "plus_40k", libelle: "Plus de 40 000 €" },
  { code: "ne_sait_pas", libelle: "Je ne sais pas encore" },
];

const OPTIONS_URGENCE = [
  { code: "moins_3_mois", libelle: "Moins de 3 mois" },
  { code: "3_6_mois", libelle: "3 à 6 mois" },
  { code: "6_12_mois", libelle: "6 à 12 mois" },
  { code: "plus_12_mois", libelle: "Plus de 12 mois" },
];

export function EtapePrecisions({ donnees, onValider, onRetour }: Props) {
  const [budget, setBudget] = useState(donnees.budgetDeclare ?? "");
  const [urgence, setUrgence] = useState(donnees.urgence ?? "");
  const [proprietaire, setProprietaire] = useState<boolean | null>(
    donnees.proprietaire ?? null,
  );

  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  const soumettre = async () => {
    setErreurs({});

    const result = schemaPrecisions.safeParse({
      budget_declare: budget || undefined,
      urgence: urgence || undefined,
      proprietaire,
    });

    if (!result.success) {
      const champs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const clef = String(issue.path[0] ?? "_global");
        if (!champs[clef]) champs[clef] = issue.message;
      }
      setErreurs(champs);
      return;
    }

    setEnCours(true);
    try {
      const res = await fetch("/api/leads/courant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_declare: budget,
          urgence,
          proprietaire,
          etape_atteinte: 6,
        }),
      });

      if (!res.ok) {
        setErreurs({ _global: "Erreur lors de l'enregistrement." });
        return;
      }

      onValider({
        budgetDeclare: budget,
        urgence,
        proprietaire: proprietaire!,
      });
    } finally {
      setEnCours(false);
    }
  };

  function Choix({
    options,
    valeur,
    onChange,
  }: {
    options: { code: string; libelle: string }[];
    valeur: string;
    onChange: (code: string) => void;
  }) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.code}
            onClick={() => onChange(o.code)}
            className={`px-4 py-2.5 rounded-full text-[0.85rem] border transition-colors ${
              valeur === o.code
                ? "bg-brass text-paper border-brass"
                : "bg-white text-ink border-hair-light hover:border-brass"
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Quelques précisions
      </h1>

      {/* Budget */}
      <div className="mt-8">
        <p className="text-[0.88rem] font-medium text-ink">
          Budget envisagé
        </p>
        <p className="text-[0.78rem] text-stone mt-1 mb-3">
          Cette information nous aide à vous proposer un projet réaliste. Elle ne
          vous engage à rien.
        </p>
        <Choix options={OPTIONS_BUDGET} valeur={budget} onChange={setBudget} />
        {erreurs.budget_declare && (
          <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.budget_declare}</p>
        )}
      </div>

      {/* Délai */}
      <div className="mt-8">
        <p className="text-[0.88rem] font-medium text-ink mb-3">
          Délai souhaité
        </p>
        <Choix options={OPTIONS_URGENCE} valeur={urgence} onChange={setUrgence} />
        {erreurs.urgence && (
          <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.urgence}</p>
        )}
      </div>

      {/* Propriétaire */}
      <div className="mt-8">
        <p className="text-[0.88rem] font-medium text-ink mb-3">
          Êtes-vous propriétaire ?
        </p>
        <div className="flex gap-2">
          {[
            { val: true, libelle: "Oui" },
            { val: false, libelle: "Non" },
          ].map((o) => (
            <button
              key={String(o.val)}
              onClick={() => setProprietaire(o.val)}
              className={`px-6 py-2.5 rounded-full text-[0.85rem] border transition-colors ${
                proprietaire === o.val
                  ? "bg-brass text-paper border-brass"
                  : "bg-white text-ink border-hair-light hover:border-brass"
              }`}
            >
              {o.libelle}
            </button>
          ))}
        </div>
        {erreurs.proprietaire && (
          <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.proprietaire}</p>
        )}
      </div>

      {erreurs._global && (
        <p className="mt-4 text-[0.88rem] text-red-700">{erreurs._global}</p>
      )}

      {/* Boutons */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onRetour}
          className="text-brass font-medium hover:text-brass-soft transition-colors"
        >
          &larr; Retour
        </button>
        <button
          disabled={enCours}
          onClick={soumettre}
          className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enCours ? "Enregistrement…" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
