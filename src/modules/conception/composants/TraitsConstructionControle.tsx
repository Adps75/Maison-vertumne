"use client";

import { useCallback, useMemo, useState } from "react";
import type { Calque, Element } from "../types";
import {
  calquesDeDessin, selectionParDefaut, selectionnerTraits, CLE_ZONE_ACTIVE, type TraitPlan,
} from "../scene3d/traits-construction";

/** Réglages des traits de construction, partagés entre le calage et le Visuel. */
export interface ReglagesTraits {
  actif: boolean;
  basculer: () => void;
  /** Calques proposés (calques de dessin). */
  calques: Calque[];
  /** Une zone est active : l'entrée « Zone active » est proposée. */
  zoneActiveDisponible: boolean;
  /** Clés cochées (noms de calques, CLE_ZONE_ACTIVE). */
  coches: Set<string>;
  basculerCalque: (cle: string) => void;
  /** Traits à dessiner (vide quand l'option est désactivée). */
  traits: TraitPlan[];
}

/** État des traits de construction (actif par défaut, non enregistré). */
export function useReglagesTraits(
  elements: Map<string, Element>,
  calques: Calque[],
  zoneActive: string | null,
): ReglagesTraits {
  const [actif, setActif] = useState(true);
  // null = sélection par défaut (suit la visibilité des calques dans l'éditeur)
  const [cochesManuelles, setCochesManuelles] = useState<Set<string> | null>(null);

  const coches = useMemo(
    () => cochesManuelles ?? selectionParDefaut(calques),
    [cochesManuelles, calques],
  );

  const basculer = useCallback(() => setActif((v) => !v), []);

  const basculerCalque = useCallback((cle: string) => {
    setCochesManuelles((prev) => {
      const s = new Set(prev ?? selectionParDefaut(calques));
      if (s.has(cle)) s.delete(cle);
      else s.add(cle);
      return s;
    });
  }, [calques]);

  const traits = useMemo(
    () => (actif ? selectionnerTraits(elements.values(), calques, zoneActive, coches) : []),
    [actif, elements, calques, zoneActive, coches],
  );

  return {
    actif,
    basculer,
    calques: useMemo(() => calquesDeDessin(calques), [calques]),
    zoneActiveDisponible: zoneActive !== null,
    coches,
    basculerCalque,
    traits,
  };
}

/** Libellés lisibles des calques. */
const LIBELLES: Record<string, string> = {
  existant: "Existant",
  sols: "Sols",
  mineral: "Minéral",
  vegetal: "Végétal",
  cotes: "Cotes",
  annotations: "Annotations",
};

/** Bouton « Traits de construction » avec choix des calques affichés. */
export function BoutonTraits({ reglages, className = "" }: { reglages: ReglagesTraits; className?: string }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const { actif, basculer, calques, zoneActiveDisponible, coches, basculerCalque } = reglages;

  const entrees = [
    ...(zoneActiveDisponible ? [{ cle: CLE_ZONE_ACTIVE, libelle: "Zone active", couleur: null as string | null }] : []),
    ...calques.map((c) => ({ cle: c.nom, libelle: LIBELLES[c.nom] ?? c.nom, couleur: c.couleur as string | null })),
  ];

  return (
    <div className={`relative flex text-[0.75rem] ${className}`}>
      <button
        onClick={basculer}
        aria-pressed={actif}
        className={`rounded-l px-3 py-1 ${
          actif ? "bg-brass hover:bg-brass-soft text-paper" : "bg-paper hover:bg-paper-2 text-ink"
        }`}
        data-testid="btn-traits"
      >
        Traits de construction
      </button>
      <button
        onClick={() => setMenuOuvert((v) => !v)}
        aria-expanded={menuOuvert}
        aria-label="Choisir les calques affichés"
        className={`rounded-r px-2 py-1 border-l ${actif ? "border-paper/30" : "border-hair-light"} ${
          actif ? "bg-brass hover:bg-brass-soft text-paper" : "bg-paper hover:bg-paper-2 text-ink"
        }`}
        data-testid="btn-traits-calques"
      >
        ▾
      </button>
      {menuOuvert && (
        <div
          className="absolute top-full right-0 mt-1 min-w-full bg-paper text-ink border border-hair-light rounded shadow-lg py-1 z-30"
          data-testid="menu-traits-calques"
        >
          {entrees.map((e) => (
            <label key={e.cle} className="flex items-center gap-2 px-3 py-1 hover:bg-paper-2 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={coches.has(e.cle)}
                onChange={() => basculerCalque(e.cle)}
                data-testid={`case-trait-${e.cle}`}
              />
              <span
                className="inline-block w-3 h-0.5"
                style={{ background: e.couleur ?? "#9C7C3C" }}
                aria-hidden
              />
              {e.libelle}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
