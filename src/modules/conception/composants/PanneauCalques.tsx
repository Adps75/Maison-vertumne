"use client";

import type { Calque } from "../types";
import type { Action } from "../editeur/reducer";

interface Props {
  calques: Calque[];
  calqueActif: string;
  opaciteOrtho: number;
  dispatch: React.Dispatch<Action>;
}

export function PanneauCalques({ calques, calqueActif, opaciteOrtho, dispatch }: Props) {
  return (
    <div className="absolute top-3 right-3 z-10 bg-white/95 rounded shadow-sm border border-hair-light p-3 w-48">
      <p className="text-[0.7rem] font-medium text-stone uppercase tracking-wider mb-2">
        Calques
      </p>

      <div className="space-y-1">
        {calques.map((c) => (
          <div
            key={c.nom}
            className={`flex items-center gap-2 px-2 py-1 rounded text-[0.78rem] cursor-pointer ${
              calqueActif === c.nom ? "bg-paper-2 font-medium" : ""
            }`}
            onClick={() => dispatch({ type: "CALQUE_ACTIF", nom: c.nom })}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "CALQUE_VISIBILITE", nom: c.nom });
              }}
              className={`w-3.5 h-3.5 rounded-sm border ${
                c.visible ? "border-green-600 bg-green-600" : "border-stone bg-white"
              }`}
              title={c.visible ? "Masquer" : "Afficher"}
            />
            <input
              type="color"
              value={c.couleur}
              onChange={(e) => {
                e.stopPropagation();
                dispatch({ type: "CALQUE_COULEUR", nom: c.nom, couleur: e.target.value });
              }}
              className="w-4 h-4 rounded-full border-0 p-0 cursor-pointer"
              style={{ backgroundColor: c.couleur }}
              title="Couleur du calque"
              data-testid={`calque-couleur-${c.nom}`}
            />
            <span className="flex-1 text-ink">{c.nom}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "CALQUE_VERROUILLAGE", nom: c.nom });
              }}
              className={`text-[0.65rem] ${c.verrouille ? "text-red-500" : "text-stone"}`}
              title={c.verrouille ? "Déverrouiller" : "Verrouiller"}
            >
              {c.verrouille ? "🔒" : "🔓"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-hair-light pt-2">
        <label className="text-[0.7rem] text-stone">
          Orthophoto
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opaciteOrtho}
            onChange={(e) =>
              dispatch({ type: "OPACITE_ORTHO", opacite: parseFloat(e.target.value) })
            }
            className="w-full mt-1"
          />
        </label>
      </div>
    </div>
  );
}
