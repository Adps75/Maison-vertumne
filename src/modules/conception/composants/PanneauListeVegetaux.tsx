"use client";

import type { Element } from "../types";
import type { Action } from "../editeur/reducer";

interface Props {
  elements: Map<string, Element>;
  dispatch: React.Dispatch<Action>;
}

interface LigneVegetal {
  plante_id: string;
  nom_commun: string;
  nom_latin: string;
  diametre_m: number;
  count: number;
  ids: string[];
  imgUrl: string | null;
}

export function compterVegetaux(elements: Map<string, Element>): LigneVegetal[] {
  const map = new Map<string, LigneVegetal>();

  for (const el of elements.values()) {
    if (el.type !== "vegetal" || !el.proprietes?.plante_id) continue;
    const pid = el.proprietes.plante_id as string;
    const existing = map.get(pid);
    if (existing) {
      existing.count++;
      existing.ids.push(el.id);
    } else {
      map.set(pid, {
        plante_id: pid,
        nom_commun: (el.proprietes.nom_commun as string) ?? pid,
        nom_latin: (el.proprietes.nom_latin as string) ?? "",
        diametre_m: (el.proprietes.diametre_m as number) ?? 1,
        count: 1,
        ids: [el.id],
        imgUrl: (el.proprietes.version as string)
          ? `/api/conception/plantes/${pid}/image/dessus?v=${encodeURIComponent(el.proprietes.version as string)}`
          : null,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nom_commun.localeCompare(b.nom_commun));
}

export function PanneauListeVegetaux({ elements, dispatch }: Props) {
  const lignes = compterVegetaux(elements);

  if (lignes.length === 0) return null;

  return (
    <div className="absolute bottom-10 right-3 z-10 bg-white/95 rounded shadow-sm border border-hair-light w-56 max-h-[40vh] flex flex-col"
      data-testid="liste-vegetaux">
      <div className="px-3 py-2 border-b border-hair-light">
        <span className="text-[0.7rem] font-medium text-stone uppercase tracking-wider">
          Végétaux du projet ({lignes.reduce((s, l) => s + l.count, 0)})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {lignes.map((l) => (
          <button key={l.plante_id}
            onClick={() => dispatch({ type: "SELECTIONNER", ids: l.ids })}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-paper-2 border-b border-hair-light/50"
            data-testid={`vegetal-ligne-${l.plante_id}`}>
            <div className="w-6 h-6 shrink-0 rounded overflow-hidden bg-paper-2">
              {l.imgUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imgUrl} alt="" className="w-full h-full object-contain" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.75rem] text-ink truncate">{l.nom_latin}</p>
            </div>
            <span className="text-[0.75rem] text-brass font-medium" data-testid={`vegetal-count-${l.plante_id}`}>
              ×{l.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
