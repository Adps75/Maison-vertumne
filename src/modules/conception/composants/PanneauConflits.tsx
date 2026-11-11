"use client";

import { useState } from "react";
import type { Conflit } from "../vegetaux/ecartement";

interface GroupeConflit {
  cle: string; // "nomA / nomB"
  paires: Conflit[];
}

function grouperConflits(conflits: Conflit[]): GroupeConflit[] {
  const map = new Map<string, Conflit[]>();
  for (const c of conflits) {
    const noms = [c.nomA, c.nomB].sort();
    const cle = `${noms[0]} / ${noms[1]}`;
    const arr = map.get(cle) ?? [];
    arr.push(c);
    map.set(cle, arr);
  }
  return Array.from(map.entries())
    .map(([cle, paires]) => ({ cle, paires }))
    .sort((a, b) => b.paires.length - a.paires.length);
}

interface Props {
  conflits: Conflit[];
  onCadrer: (ids: [string, string]) => void;
}

/**
 * Section repliable "Conflits" à intégrer dans le panneau Végétaux du projet.
 * Rendu inline (pas de positionnement absolu).
 */
export function SectionConflits({ conflits, onCadrer }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [groupeOuvert, setGroupeOuvert] = useState<string | null>(null);

  if (conflits.length === 0) return null;

  const groupes = grouperConflits(conflits);

  return (
    <div className="border-t border-hair-light" data-testid="panneau-conflits">
      {/* En-tête compact repliable */}
      <button
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-paper-2 text-left"
        data-testid="btn-conflits-toggle"
      >
        <span className="text-[0.7rem] text-amber-600">⚠</span>
        <span className="text-[0.72rem] font-medium text-amber-700">
          {conflits.length} conflit{conflits.length > 1 ? "s" : ""}
        </span>
        <span className="text-[0.65rem] text-stone ml-auto">{ouvert ? "▾" : "▸"}</span>
      </button>

      {ouvert && (
        <div className="max-h-[30vh] overflow-y-auto">
          {groupes.map((g) => (
            <div key={g.cle} className="border-t border-hair-light/50">
              <button
                onClick={() => setGroupeOuvert(groupeOuvert === g.cle ? null : g.cle)}
                className="w-full flex items-center px-3 py-1.5 hover:bg-paper-2 text-left text-[0.72rem]"
              >
                <span className="text-ink truncate flex-1">{g.cle}</span>
                <span className="text-amber-600 font-medium shrink-0 ml-2">
                  {g.paires.length}
                </span>
                <span className="text-[0.6rem] text-stone ml-1">
                  {groupeOuvert === g.cle ? "▾" : "▸"}
                </span>
              </button>

              {groupeOuvert === g.cle && (
                <div className="bg-paper-2/50">
                  {g.paires.map((c) => (
                    <button
                      key={`${c.idA}-${c.idB}`}
                      onClick={(e) => { e.stopPropagation(); onCadrer([c.idA, c.idB]); }}
                      className="w-full text-left px-4 py-1 hover:bg-paper-2 text-[0.68rem] text-stone"
                    >
                      {c.distance.toFixed(2).replace(".", ",")} m
                      <span className="text-red-600"> / min {c.distanceMin.toFixed(2).replace(".", ",")} m</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
