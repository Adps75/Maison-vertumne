"use client";

import { useState, useEffect } from "react";
import type { DonneesEstimation } from "@/lib/types/estimation";
import type { DetailPrestation } from "@/lib/types/tarifs";

interface Props {
  donnees: DonneesEstimation;
  onValider: () => void;
  onRetour: () => void;
}

export function EtapeEstimation({ donnees, onValider, onRetour }: Props) {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [min, setMin] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailPrestation[]>([]);

  useEffect(() => {
    let annule = false;

    async function calculer() {
      setChargement(true);
      setErreur(null);

      try {
        const res = await fetch("/api/leads/courant/estimation", {
          method: "POST",
        });
        const data = await res.json();

        if (annule) return;

        if (!res.ok || !data.ok) {
          setErreur(data.error ?? "Impossible de calculer l'estimation.");
          return;
        }

        setMin(data.min);
        setMax(data.max);
        setDetail(data.detail ?? []);
      } catch {
        if (!annule) setErreur("Erreur de connexion.");
      } finally {
        if (!annule) setChargement(false);
      }
    }

    calculer();
    return () => { annule = true; };
  }, [donnees.leadId]);

  if (chargement) {
    return (
      <div className="text-center py-20">
        <p className="text-stone text-[0.95rem]">Calcul de votre estimation…</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="py-10">
        <p className="text-red-700 text-[0.95rem]">{erreur}</p>
        <button
          onClick={onRetour}
          className="mt-6 text-brass font-medium hover:text-brass-soft transition-colors"
        >
          &larr; Retour
        </button>
      </div>
    );
  }

  const fmt = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Votre estimation
      </h1>

      {min != null && max != null && (
        <div className="mt-8 p-8 bg-green-950 text-paper rounded">
          <p className="font-serif font-medium text-[clamp(2rem,5vw,3.2rem)] leading-tight">
            À partir de {fmt(min)}
          </p>
          <p className="mt-3 text-[1.05rem] text-celadon">
            Fourchette indicative : {fmt(min)} à {fmt(max)} TTC
          </p>
        </div>
      )}

      {detail.length > 0 && (
        <div className="mt-8">
          <p className="text-[0.88rem] font-medium text-ink mb-3">
            Prestations retenues
          </p>
          <ul className="space-y-1.5">
            {detail.map((d) => (
              <li
                key={d.code}
                className="flex items-center gap-2 text-[0.92rem] text-ink"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-brass shrink-0" />
                {d.libelle}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-8 text-[0.84rem] text-stone leading-relaxed max-w-prose">
        Estimation indicative établie à partir de vos réponses et des prix moyens
        constatés en Île-de-France. Elle sera affinée lors du diagnostic sur place.
      </p>

      {/* Boutons */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onRetour}
          className="text-brass font-medium hover:text-brass-soft transition-colors"
        >
          &larr; Retour
        </button>
        <button
          onClick={onValider}
          className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors"
        >
          Recevoir mon pré-diagnostic
        </button>
      </div>
    </div>
  );
}
