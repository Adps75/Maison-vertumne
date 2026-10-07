"use client";

import type { NomOutil, NumeroEtape } from "../types";
import { outilDisponibleAEtape } from "../types";
import type { Action } from "../editeur/reducer";

interface Props {
  outil: NomOutil;
  accrochage: boolean;
  ortho: boolean;
  etape: NumeroEtape;
  dispatch: React.Dispatch<Action>;
}

const OUTILS: { nom: NomOutil; label: string; raccourci: string }[] = [
  { nom: "selection", label: "Sélection", raccourci: "Échap" },
  { nom: "polyligne", label: "Polyligne", raccourci: "PL" },
  { nom: "rectangle", label: "Rectangle", raccourci: "REC" },
  { nom: "cercle", label: "Cercle", raccourci: "C" },
  { nom: "arc", label: "Arc", raccourci: "A" },
  { nom: "cote", label: "Cote", raccourci: "DI" },
  { nom: "texte", label: "Texte", raccourci: "T" },
  { nom: "mesurer", label: "Mesurer", raccourci: "" },
];

const EDITION: { nom: NomOutil; label: string; raccourci: string }[] = [
  { nom: "deplacer", label: "Déplacer", raccourci: "M" },
  { nom: "copier", label: "Copier", raccourci: "CO" },
  { nom: "rotation", label: "Rotation", raccourci: "RO" },
  { nom: "miroir", label: "Miroir", raccourci: "MI" },
];

export function BarreOutils({ outil, accrochage, ortho, etape, dispatch }: Props) {
  const outilsFiltres = OUTILS.filter((o) => outilDisponibleAEtape(o.nom, etape));
  const editionFiltree = EDITION.filter((o) => outilDisponibleAEtape(o.nom, etape));

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-white/95 rounded shadow-sm border border-hair-light p-1.5">
      {outilsFiltres.map((o) => (
        <button
          key={o.nom}
          onClick={() => dispatch({ type: "CHANGER_OUTIL", outil: o.nom })}
          className={`px-2.5 py-1.5 rounded text-[0.75rem] text-left transition-colors ${
            outil === o.nom
              ? "bg-brass text-paper"
              : "text-ink hover:bg-paper-2"
          }`}
          title={o.raccourci ? `${o.label} (${o.raccourci})` : o.label}
        >
          {o.label}
        </button>
      ))}

      {editionFiltree.length > 0 && <div className="border-t border-hair-light my-1" />}

      {editionFiltree.map((o) => (
        <button
          key={o.nom}
          onClick={() => dispatch({ type: "CHANGER_OUTIL", outil: o.nom })}
          className={`px-2.5 py-1.5 rounded text-[0.75rem] text-left transition-colors ${
            outil === o.nom
              ? "bg-brass text-paper"
              : "text-ink hover:bg-paper-2"
          }`}
          title={`${o.label} (${o.raccourci})`}
        >
          {o.label}
        </button>
      ))}

      <div className="border-t border-hair-light my-1" />

      <button
        onClick={() => dispatch({ type: "TOGGLE_ACCROCHAGE" })}
        className={`px-2.5 py-1.5 rounded text-[0.75rem] text-left ${
          accrochage ? "text-brass font-medium" : "text-stone"
        }`}
        title="Accrochage (F3)"
      >
        Accro {accrochage ? "ON" : "OFF"}
      </button>
      <button
        onClick={() => dispatch({ type: "TOGGLE_ORTHO" })}
        className={`px-2.5 py-1.5 rounded text-[0.75rem] text-left ${
          ortho ? "text-brass font-medium" : "text-stone"
        }`}
        title="Ortho (F8)"
      >
        Ortho {ortho ? "ON" : "OFF"}
      </button>
    </div>
  );
}
