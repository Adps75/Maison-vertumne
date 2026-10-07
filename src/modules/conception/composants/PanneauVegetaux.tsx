"use client";

import { useEffect, useState } from "react";
import type { PlanteSelectionnee } from "../types";
import type { Action } from "../editeur/reducer";

interface PlanteAPI {
  id: string;
  nom_commun: string;
  nom_latin: string;
  categorie: string;
  largeur_adulte_m: number | null;
  hauteur_adulte_m: number | null;
  statut: string;
  cout_generation_total: number;
  image_dessus_path: string | null;
  updated_at?: string;
}

interface Props {
  dispatch: React.Dispatch<Action>;
  planteActive: PlanteSelectionnee | null;
}

const CATEGORIES = [
  { code: "", label: "Toutes" },
  { code: "arbre", label: "Arbres" },
  { code: "arbuste", label: "Arbustes" },
  { code: "vivace", label: "Vivaces" },
  { code: "graminee", label: "Graminées" },
  { code: "couvre_sol", label: "Couvre-sol" },
  { code: "grimpante", label: "Grimpantes" },
];

export function PanneauVegetaux({ dispatch, planteActive }: Props) {
  const [plantes, setPlantes] = useState<PlanteAPI[]>([]);
  const [categorie, setCategorie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ statut: "validee" });
    if (categorie) params.set("categorie", categorie);
    if (recherche) params.set("q", recherche);
    fetch(`/api/conception/plantes?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPlantes(d.plantes); });
  }, [categorie, recherche]);

  const choisir = (p: PlanteAPI) => {
    dispatch({
      type: "CHANGER_PLANTE",
      plante: {
        id: p.id,
        nom_commun: p.nom_commun,
        nom_latin: p.nom_latin,
        diametre_m: p.largeur_adulte_m ?? 1,
        hauteur_m: p.hauteur_adulte_m ?? 1,
        version: p.updated_at ?? "",
      },
    });
  };

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)}
        className="absolute top-3 left-[140px] z-10 bg-white/95 border border-hair-light rounded px-2 py-1 text-[0.75rem] text-brass hover:text-brass-soft">
        🌱 Végétaux
      </button>
    );
  }

  return (
    <div className="absolute top-3 left-[140px] z-10 bg-white/95 rounded shadow-sm border border-hair-light w-52 max-h-[60vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hair-light">
        <span className="text-[0.7rem] font-medium text-stone uppercase tracking-wider">Végétaux</span>
        <button onClick={() => setOuvert(false)} className="text-stone hover:text-ink text-[0.75rem]">×</button>
      </div>

      <div className="px-2 py-1.5 border-b border-hair-light">
        <input type="text" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…" className="w-full px-2 py-1 text-[0.78rem] border border-hair-light rounded bg-white" />
        <div className="flex flex-wrap gap-1 mt-1">
          {CATEGORIES.map((c) => (
            <button key={c.code} onClick={() => setCategorie(c.code)}
              className={`px-1.5 py-0.5 rounded text-[0.65rem] ${categorie === c.code ? "bg-brass text-paper" : "text-stone hover:text-brass"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {plantes.map((p) => {
          const actif = planteActive?.id === p.id;
          const imgUrl = p.image_dessus_path
            ? `/api/conception/plantes/${p.id}/image/dessus?v=${encodeURIComponent(p.updated_at ?? "")}`
            : null;

          return (
            <button key={p.id} onClick={() => choisir(p)}
              className={`w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-paper-2 border-b border-hair-light/50 ${actif ? "bg-paper-2 border-l-2 border-l-brass" : ""}`}>
              <div className="shrink-0 rounded overflow-hidden"
                style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 8px 8px" }}>
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt="" style={{ width: 32, height: 32 }} className="object-contain" />
                ) : (
                  <span className="text-[0.6rem] text-stone flex items-center justify-center w-full h-full">●</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.78rem] text-ink truncate">{p.nom_commun}</p>
                <p className="text-[0.65rem] text-stone truncate italic">{p.nom_latin}</p>
                <p className="text-[0.6rem] text-stone">⌀ {p.largeur_adulte_m ?? "?"} m</p>
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
