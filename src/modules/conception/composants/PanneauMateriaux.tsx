"use client";

/**
 * Matériaux du projet (étape 3) : bibliothèque de l'atelier et quantitatif calculé
 * depuis le plan (m² pour les surfaces, ml pour les linéaires), pour le futur dossier
 * et le devis. Le matériau se pose sur un tracé ou une surface depuis le panneau
 * Propriétés.
 */

import { useMemo, useState } from "react";
import type { Element } from "../types";
import { quantitesMateriaux, type Materiau } from "../materiaux/materiaux";
import { ApercuMateriau } from "./ApercuMateriau";

interface Props {
  materiaux: Materiau[];
  elements: Map<string, Element>;
  onPrixModifie: () => void;
}

const UNITES = { m2: "m²", ml: "ml" } as const;
const nombre = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const euros = (v: number) => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function PanneauMateriaux({ materiaux, elements, onPrixModifie }: Props) {
  const [ouvert, setOuvert] = useState(true);
  const lignes = useMemo(() => quantitesMateriaux(elements.values(), materiaux), [elements, materiaux]);
  const total = lignes.reduce((s, l) => s + (l.montant ?? 0), 0);
  const sansPrix = lignes.some((l) => l.montant === null);

  const enregistrerPrix = async (m: Materiau, texte: string) => {
    const t = texte.trim().replace(",", ".");
    const prix = t === "" ? null : Number(t);
    if (prix !== null && (!Number.isFinite(prix) || prix < 0)) return;
    if (prix === m.prix_unitaire) return;
    await fetch(`/api/conception/materiaux/${m.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prix_unitaire: prix }),
    }).catch(() => {});
    onPrixModifie();
  };

  return (
    <div className="absolute top-3 right-[13.5rem] z-10 bg-white/95 rounded shadow-sm border border-hair-light w-72 max-h-[70vh] flex flex-col text-[0.76rem]" data-testid="panneau-materiaux">
      <button className="flex items-center px-3 py-2 text-left" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
        <span className="text-[0.7rem] font-medium text-stone uppercase tracking-wider">Matériaux</span>
        <span className="ml-auto text-stone">{ouvert ? "▾" : "▸"}</span>
      </button>
      {ouvert && (
        <div className="overflow-y-auto px-3 pb-3">
          {materiaux.length === 0 ? (
            <p className="text-stone">Aucun matériau : appliquez la migration 00025.</p>
          ) : (
            <>
              <p className="text-stone text-[0.7rem] mb-2">Sélectionnez un tracé ou une surface, puis choisissez son matériau dans Propriétés.</p>
              <ul className="space-y-1.5 mb-3">
                {materiaux.map((m) => (
                  <li key={m.id} className="flex items-center gap-2" data-testid={`materiau-${m.id}`}>
                    <ApercuMateriau materiau={m} />
                    <span className="flex-1 min-w-0 truncate" title={m.description_ia}>{m.nom}</span>
                    <input key={`${m.id}-${m.prix_unitaire}`} className="w-14 border border-hair-light rounded px-1 py-0.5 text-right"
                      defaultValue={m.prix_unitaire == null ? "" : String(m.prix_unitaire).replace(".", ",")} placeholder="prix"
                      aria-label={`Prix unitaire HT de ${m.nom} (€/${UNITES[m.unite]})`} onBlur={(e) => enregistrerPrix(m, e.target.value)} />
                    <span className="text-stone w-10">€/{UNITES[m.unite]}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[0.7rem] font-medium text-stone uppercase tracking-wider mb-1">Quantitatif</p>
              {lignes.length === 0 ? (
                <p className="text-stone" data-testid="quantitatif-vide">Aucun matériau posé sur le plan.</p>
              ) : (
                <table className="w-full" data-testid="quantitatif">
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.materiau.id} data-testid={`quantite-${l.materiau.id}`}>
                        <td className="py-0.5 pr-2">{l.materiau.nom}</td>
                        <td className="py-0.5 text-right whitespace-nowrap" data-testid="quantite-valeur">{nombre(l.quantite)} {UNITES[l.materiau.unite]}</td>
                        <td className="py-0.5 pl-2 text-right text-stone whitespace-nowrap">{l.montant === null ? "—" : euros(l.montant)}</td>
                      </tr>
                    ))}
                    {total > 0 && (
                      <tr className="border-t border-hair-light">
                        <td className="pt-1 font-medium" colSpan={2}>Total HT{sansPrix ? " (prix connus)" : ""}</td>
                        <td className="pt-1 text-right font-medium" data-testid="total-materiaux">{euros(total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
