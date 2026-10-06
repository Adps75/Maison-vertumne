"use client";

import type { NumeroEtape } from "../types";
import { ETAPES_LABELS, ETAPES_ACTIVES } from "../types";
import type { Action } from "../editeur/reducer";

interface Props {
  etape: NumeroEtape;
  aZones: boolean;
  aVegetaux: boolean;
  dispatch: React.Dispatch<Action>;
}

const ETAPES: NumeroEtape[] = [1, 2, 3, 4, 5, 6];

export function BarreEtapes({ etape, aZones, aVegetaux, dispatch }: Props) {
  const coche = (n: NumeroEtape): boolean => {
    if (n === 1) return true; // Toujours (parcelle créée)
    if (n === 2) return aZones;
    if (n === 4) return aVegetaux;
    return false;
  };

  return (
    <nav className="flex items-center gap-0 bg-white/95 border-b border-hair-light px-4 py-0 shrink-0" data-testid="barre-etapes">
      {ETAPES.map((n) => {
        const actif = etape === n;
        const accessible = ETAPES_ACTIVES.has(n);
        const aCoche = coche(n);

        return (
          <button
            key={n}
            onClick={() => accessible && dispatch({ type: "CHANGER_ETAPE", etape: n })}
            disabled={!accessible}
            className={`
              relative px-4 py-2 text-[0.78rem] transition-colors
              ${actif
                ? "text-brass font-medium border-b-2 border-brass"
                : accessible
                  ? "text-ink hover:text-brass cursor-pointer"
                  : "text-stone/40 cursor-not-allowed"
              }
            `}
            data-testid={`etape-${n}`}
          >
            <span className="mr-1 text-[0.65rem] text-stone">{n}.</span>
            {ETAPES_LABELS[n]}
            {aCoche && <span className="ml-1 text-green-600 text-[0.65rem]">✓</span>}
          </button>
        );
      })}
    </nav>
  );
}
