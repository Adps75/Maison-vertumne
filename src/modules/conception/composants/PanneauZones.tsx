"use client";

import { useState } from "react";
import type { Element } from "../types";
import type { Action } from "../editeur/reducer";
import { surface } from "../geo/plan";
import type { Pt } from "../geo/plan";

interface Props {
  elements: Map<string, Element>;
  zoneActive: string | null;
  dispatch: React.Dispatch<Action>;
  onCadrerZone: (points: Pt[]) => void;
  onToutLeJardin: () => void;
}

function zonesTriees(elements: Map<string, Element>): Element[] {
  return Array.from(elements.values())
    .filter((el) => el.type === "zone")
    .sort((a, b) => ((a.proprietes?.ordre as number) ?? 0) - ((b.proprietes?.ordre as number) ?? 0));
}

function pointsDe(el: Element): Pt[] {
  if (el.geometrie.type === "polygone" || el.geometrie.type === "rectangle") {
    return el.geometrie.points;
  }
  return [];
}

export function PanneauZones({ elements, zoneActive, dispatch, onCadrerZone, onToutLeJardin }: Props) {
  const zones = zonesTriees(elements);
  const [renommage, setRenommage] = useState<string | null>(null);
  const [nomTemp, setNomTemp] = useState("");

  const commencerRenommage = (z: Element) => {
    setRenommage(z.id);
    setNomTemp((z.proprietes?.nom as string) ?? "Zone");
  };

  const validerRenommage = () => {
    if (renommage && nomTemp.trim()) {
      dispatch({ type: "RENOMMER_ZONE", id: renommage, nom: nomTemp.trim() });
    }
    setRenommage(null);
  };

  return (
    <div className="absolute top-3 left-[140px] z-10 bg-white/95 rounded shadow-sm border border-hair-light w-52 max-h-[60vh] flex flex-col overflow-hidden" data-testid="panneau-zones">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hair-light">
        <span className="text-[0.7rem] font-medium text-stone uppercase tracking-wider">Zones de travail</span>
      </div>

      <div className="px-2 py-1.5 border-b border-hair-light flex gap-1">
        <button
          onClick={() => dispatch({ type: "CHANGER_OUTIL", outil: "zone_rectangle" })}
          className="flex-1 px-2 py-1 rounded text-[0.72rem] text-ink hover:bg-paper-2 border border-hair-light"
          data-testid="zone-rect-btn"
        >
          Rectangle
        </button>
        <button
          onClick={() => dispatch({ type: "CHANGER_OUTIL", outil: "zone_polygone" })}
          className="flex-1 px-2 py-1 rounded text-[0.72rem] text-ink hover:bg-paper-2 border border-hair-light"
          data-testid="zone-poly-btn"
        >
          Polygone
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {zones.map((z) => {
          const nom = (z.proprietes?.nom as string) ?? "Zone";
          const pts = pointsDe(z);
          const surf = pts.length >= 3 ? surface(pts) : 0;
          const actif = zoneActive === z.id;

          return (
            <div
              key={z.id}
              className={`flex items-center gap-1 px-2 py-1.5 border-b border-hair-light/50 ${actif ? "bg-paper-2 border-l-2 border-l-brass" : ""}`}
              data-testid={`zone-${z.id}`}
            >
              <button
                onClick={() => {
                  dispatch({ type: "ACTIVER_ZONE", id: actif ? null : z.id });
                  if (!actif && pts.length > 0) onCadrerZone(pts);
                }}
                className="flex-1 text-left min-w-0"
              >
                {renommage === z.id ? (
                  <input
                    type="text"
                    value={nomTemp}
                    onChange={(e) => setNomTemp(e.target.value)}
                    onBlur={validerRenommage}
                    onKeyDown={(e) => { if (e.key === "Enter") validerRenommage(); }}
                    className="w-full px-1 py-0.5 text-[0.75rem] border border-hair-light rounded bg-white"
                    autoFocus
                    data-testid="zone-nom-input"
                  />
                ) : (
                  <>
                    <p className="text-[0.78rem] text-ink truncate">{nom}</p>
                    {surf > 0 && <p className="text-[0.6rem] text-stone">{Math.round(surf)} m²</p>}
                  </>
                )}
              </button>
              <button
                onClick={() => commencerRenommage(z)}
                className="text-[0.65rem] text-stone hover:text-brass shrink-0"
                title="Renommer"
              >
                ✏️
              </button>
              <button
                onClick={() => {
                  dispatch({ type: "SELECTIONNER", ids: [z.id] });
                  dispatch({ type: "SUPPRIMER_SELECTION" });
                  if (zoneActive === z.id) dispatch({ type: "ACTIVER_ZONE", id: null });
                }}
                className="text-[0.65rem] text-stone hover:text-red-500 shrink-0"
                title="Supprimer"
                data-testid={`zone-suppr-${z.id}`}
              >
                🗑
              </button>
            </div>
          );
        })}
        {zones.length === 0 && (
          <p className="text-[0.75rem] text-stone text-center py-4">Aucune zone définie</p>
        )}
      </div>

      <div className="px-2 py-1.5 border-t border-hair-light">
        <button
          onClick={onToutLeJardin}
          className="w-full px-2 py-1.5 rounded text-[0.72rem] text-brass hover:bg-paper-2 border border-hair-light font-medium"
          data-testid="tout-le-jardin-btn"
        >
          Tout le jardin
        </button>
      </div>
    </div>
  );
}
