"use client";

import { useState } from "react";
import type { Element } from "../types";

interface Props {
  element: Element;
  onModifier: (element: Element) => void;
  onRemplacer: () => void;
}

export function PanneauProprietes3D({ element, onModifier, onRemplacer }: Props) {
  const nom = (element.proprietes.nom_commun as string) ?? "Plante";
  const latin = (element.proprietes.nom_latin as string) ?? "";
  const [hauteur, setHauteur] = useState(String(element.proprietes.hauteur_m ?? element.hauteur ?? 2));
  const [diametre, setDiametre] = useState(String(element.proprietes.diametre_m ?? 1));

  const appliquer = (champ: "hauteur_m" | "diametre_m", valeur: string) => {
    const v = parseFloat(valeur.replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    onModifier({
      ...element,
      hauteur: champ === "hauteur_m" ? v : element.hauteur,
      proprietes: { ...element.proprietes, [champ]: v },
    });
  };

  return (
    <div
      className="absolute bottom-4 left-3 z-20 bg-paper rounded shadow-md border border-hair-light w-52 p-3"
      data-testid="panneau-proprietes-3d"
    >
      <p className="text-[0.82rem] text-ink font-medium truncate">{nom}</p>
      {latin && <p className="text-[0.68rem] text-stone italic truncate mb-2">{latin}</p>}

      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-[0.7rem] text-stone w-16">Hauteur</label>
        <input
          type="text"
          value={hauteur}
          onChange={(e) => setHauteur(e.target.value)}
          onBlur={() => appliquer("hauteur_m", hauteur)}
          onKeyDown={(e) => { if (e.key === "Enter") appliquer("hauteur_m", hauteur); }}
          className="flex-1 bg-white border border-hair-light rounded px-2 py-0.5 text-[0.75rem] text-ink"
          data-testid="input-hauteur-3d"
        />
        <span className="text-[0.65rem] text-stone">m</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-[0.7rem] text-stone w-16">Diamètre</label>
        <input
          type="text"
          value={diametre}
          onChange={(e) => setDiametre(e.target.value)}
          onBlur={() => appliquer("diametre_m", diametre)}
          onKeyDown={(e) => { if (e.key === "Enter") appliquer("diametre_m", diametre); }}
          className="flex-1 bg-white border border-hair-light rounded px-2 py-0.5 text-[0.75rem] text-ink"
          data-testid="input-diametre-3d"
        />
        <span className="text-[0.65rem] text-stone">m</span>
      </div>

      <button
        onClick={onRemplacer}
        className="w-full bg-paper-2 hover:bg-stone-200 text-ink rounded px-2 py-1 text-[0.72rem] border border-hair-light"
        data-testid="btn-remplacer-3d"
      >
        Remplacer par…
      </button>
    </div>
  );
}
