"use client";

import { useEffect, useState } from "react";
import type { PlanteSelectionnee } from "../types";

interface PlanteAPI {
  id: string;
  nom_commun: string;
  nom_latin: string;
  categorie: string;
  forme: string | null;
  largeur_adulte_m: number | null;
  largeur_3ans_m?: number | null;
  hauteur_adulte_m: number | null;
  statut: string;
  updated_at?: string;
  image_dessus_path: string | null;
}

interface Props {
  onSelectPlante: (plante: PlanteSelectionnee) => void;
  planteActive: PlanteSelectionnee | null;
}

export function PanneauVegetaux3D({ onSelectPlante, planteActive }: Props) {
  const [plantes, setPlantes] = useState<PlanteAPI[]>([]);
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ statut: "validee" });
    if (recherche) params.set("q", recherche);
    fetch(`/api/conception/plantes?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPlantes(d.plantes); });
  }, [recherche]);

  const choisir = (p: PlanteAPI) => {
    onSelectPlante({
      id: p.id,
      nom_commun: p.nom_commun,
      nom_latin: p.nom_latin,
      diametre_m: p.largeur_adulte_m ?? 1,
      largeur_3ans_m: p.largeur_3ans_m ?? null,
      hauteur_m: p.hauteur_adulte_m ?? 1,
      version: p.updated_at ?? "",
      categorie: p.categorie,
      forme: p.forme,
    });
  };

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="absolute top-12 left-3 z-20 bg-paper hover:bg-paper-2 text-ink rounded shadow-sm border border-hair-light px-3 py-1.5 text-[0.75rem]"
        data-testid="btn-vegetaux-3d"
      >
        Végétaux
      </button>
    );
  }

  return (
    <div
      className="absolute top-12 left-3 z-20 bg-paper rounded shadow-md border border-hair-light w-52 max-h-[50vh] flex flex-col overflow-hidden"
      data-testid="panneau-vegetaux-3d"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-hair-light">
        <span className="text-[0.72rem] font-medium text-stone uppercase tracking-wider">Végétaux</span>
        <button onClick={() => setOuvert(false)} className="text-stone hover:text-ink text-[0.75rem]">×</button>
      </div>

      <div className="px-2 py-1.5 border-b border-hair-light">
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          className="w-full px-2 py-1 text-[0.78rem] border border-hair-light rounded bg-white text-ink"
          data-testid="recherche-vegetaux-3d"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {plantes.map((p) => {
          const actif = planteActive?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => choisir(p)}
              className={`w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-paper-2 border-b border-hair-light/50 ${
                actif ? "bg-paper-2 border-l-2 border-l-brass" : ""
              }`}
              data-testid={`plante-3d-${p.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[0.78rem] text-ink truncate">{p.nom_commun}</p>
                <p className="text-[0.65rem] text-stone truncate italic">{p.nom_latin}</p>
              </div>
            </button>
          );
        })}
        {plantes.length === 0 && (
          <p className="text-[0.75rem] text-stone text-center py-4">Aucune plante validée</p>
        )}
      </div>
    </div>
  );
}
