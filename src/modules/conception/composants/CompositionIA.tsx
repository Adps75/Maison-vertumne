"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Element, NumeroEtape } from "../types";
import type { Action } from "../editeur/reducer";
import { derniereActionHistorique } from "../editeur/reducer";
import type { Pt } from "../geo/plan";
import { genererIdLocal } from "@/lib/id-client";
import { extrairePointsSurface } from "../scene3d/preparer-donnees";
import { extraireVoisines } from "../vegetaux/ecartement";
import {
  dimensionsEtForme, exposition, pente, devantDuMassif, plantesAutour,
  type BatimentPlan, type VuePlan,
} from "../composition/contexte";
import { placerComposition, type EcartQuantite } from "../composition/placement";
import {
  plantesAPlacer, toleranceDensite, elementsComposition, plantesCompositionExistante,
} from "../composition/application";
import type { Contexte } from "../composition/schemas";
import { AssistantComposition, type CompositionPrete, type ContourComposition } from "./AssistantComposition";

interface BatimentGeo {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  hauteur: number | null;
}

interface VueGeo {
  nom: string;
  camera: { x: number; y: number };
  statut: "a_caler" | "cale";
}

interface Params {
  projetId: string;
  etape: NumeroEtape;
  elements: Map<string, Element>;
  zoneActive: string | null;
  dispatch: React.Dispatch<Action>;
  batiments: BatimentGeo[];
  vues: VueGeo[];
  altitudeEn: ((x: number, y: number) => number) | null;
  tolerance: number;
}

interface CompositionAffichee extends CompositionPrete {
  graine: number;
  ids: string[];
  suppressions: string[];
  ecarts: EcartQuantite[];
}

function batimentsPlan(batiments: BatimentGeo[]): BatimentPlan[] {
  return batiments.map((b) => {
    const anneaux = b.geometry.type === "MultiPolygon" ? b.geometry.coordinates.flat(1) : b.geometry.coordinates;
    return { contour: (anneaux[0] ?? []).map(([x, y]) => [x, y] as Pt), hauteur: b.hauteur ?? 6 };
  });
}

/**
 * Composition IA : assistant (brief, palette), application au plan en une action
 * annulable, confirmation de remplacement, barre « Garder / Autre proposition / Annuler ».
 */
export function useCompositionIA(p: Params): { ouvrir: () => void; rendu: ReactNode } {
  const [ouvert, setOuvert] = useState(false);
  const [affichee, setAffichee] = useState<CompositionAffichee | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{ pret: CompositionPrete; existantes: string[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Contours possibles : zones et surfaces dessinées
  const contours = useMemo(() => {
    const liste: (ContourComposition & { points: Pt[] })[] = [];
    let n = 0;
    for (const el of p.elements.values()) {
      if (el.type !== "zone" && el.type !== "sol") continue;
      const points = extrairePointsSurface(el);
      if (!points) continue;
      const nom = el.type === "zone"
        ? `Zone « ${(el.proprietes.nom as string) || "sans nom"} »${el.id === p.zoneActive ? " (active)" : ""}`
        : `Surface dessinée ${++n} (${el.calque})`;
      liste.push({ id: el.id, nom, points });
    }
    return liste;
  }, [p.elements, p.zoneActive]);

  const bats = useMemo(() => batimentsPlan(p.batiments), [p.batiments]);
  const vues: VuePlan[] = useMemo(
    () => p.vues.map((v) => ({ nom: v.nom, position: [v.camera.x, v.camera.y] as Pt, calee: v.statut === "cale" })),
    [p.vues],
  );

  const pointsContour = useCallback((id: string) => contours.find((c) => c.id === id)?.points ?? null, [contours]);

  const calculerContexte = useCallback((contourId: string): Contexte | null => {
    const points = pointsContour(contourId);
    if (!points) return null;
    const devant = devantDuMassif(points, vues, bats);
    const existantes = [];
    for (const el of p.elements.values()) {
      if (el.type === "vegetal" && el.geometrie.type === "point" && !el.proprietes.composition_id) {
        existantes.push({
          position: el.geometrie.position,
          nom_latin: (el.proprietes.nom_latin as string) ?? "",
          nom_commun: (el.proprietes.nom_commun as string) ?? "",
        });
      }
    }
    return {
      ...dimensionsEtForme(points),
      ...exposition(points, bats),
      pente: pente(points, p.altitudeEn),
      devant: devant.devant,
      plantesExistantes: plantesAutour(points, existantes),
      vues: vues.filter((v) => v.calee).map((v) => ({ nom: v.nom, principale: v.nom === devant.vuePrincipale })),
    };
  }, [pointsContour, vues, bats, p.elements, p.altitudeEn]);

  /** Calcule le placement et l'applique en UNE action annulable. */
  const appliquer = useCallback((pret: CompositionPrete, graine: number, suppressions: string[]) => {
    const points = pointsContour(pret.contourId);
    if (!points) return;
    const exclues = new Set(suppressions);
    const existantes = extraireVoisines(p.elements).filter((v) => !exclues.has(v.id));
    const resultat = placerComposition({
      contour: points,
      plantes: plantesAPlacer(pret.intention, pret.plantes),
      versDevant: devantDuMassif(points, vues, bats).versDevant,
      geometrique: pret.brief.structure === "geometrique" || pret.intention.geometrie?.symetrie === "gauche_droite",
      tolerance: toleranceDensite(p.tolerance, pret.brief.densite),
      existantes,
      graine,
    });
    const ajouts = elementsComposition({
      placements: resultat.placements,
      plantes: pret.plantes,
      compositionId: pret.compositionId,
      contourId: pret.contourId,
      ordreBase: p.elements.size,
      genererId: genererIdLocal,
    });
    p.dispatch({ type: "APPLIQUER_COMPOSITION", ajouts, suppressions });
    setAffichee({ ...pret, graine, ids: ajouts.map((a) => a.id), suppressions, ecarts: resultat.ecarts });
  }, [pointsContour, p, vues, bats]);

  const onComposer = useCallback((pret: CompositionPrete) => {
    setOuvert(false);
    const existantes = plantesCompositionExistante(p.elements.values(), pret.contourId);
    if (existantes.length > 0) setAConfirmer({ pret, existantes });
    else appliquer(pret, 1, []);
  }, [p.elements, appliquer]);

  /** La dernière action annulable est-elle bien cette composition ? */
  const estDerniere = useCallback((c: CompositionAffichee) => {
    const d = derniereActionHistorique(p.etape);
    return d?.type === "composition" && d.apres[0]?.id === c.ids[0];
  }, [p.etape]);

  const garder = async () => {
    if (!affichee) return;
    await fetch(`/api/conception/projets/${p.projetId}/compositions/${affichee.compositionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graine: affichee.graine }),
    }).catch(() => {});
    setAffichee(null);
  };

  const autreProposition = () => {
    if (!affichee) return;
    if (!estDerniere(affichee)) {
      setMessage("Le plan a été modifié depuis la composition : utilisez Cmd+Z pour revenir en arrière.");
      setAffichee(null);
      return;
    }
    p.dispatch({ type: "ANNULER" });
    appliquer(affichee, affichee.graine + 1, affichee.suppressions);
  };

  const annuler = () => {
    if (affichee && estDerniere(affichee)) p.dispatch({ type: "ANNULER" });
    else if (affichee) setMessage("Le plan a été modifié depuis la composition : utilisez Cmd+Z pour revenir en arrière.");
    setAffichee(null);
  };

  const nomsEcarts = (e: EcartQuantite[]) => {
    const parId = new Map(affichee?.plantes.map((x) => [x.id, x.nom_commun]) ?? []);
    return e.map((x) => `${parId.get(x.cle) ?? x.cle} : ${x.place} sur ${x.demande}`).join(", ");
  };

  const rendu = (
    <>
      {ouvert && (
        <AssistantComposition
          projetId={p.projetId}
          contours={contours}
          contourParDefaut={p.zoneActive && contours.some((c) => c.id === p.zoneActive) ? p.zoneActive : contours[0]?.id ?? null}
          calculerContexte={calculerContexte}
          onComposer={onComposer}
          onFermer={() => setOuvert(false)}
        />
      )}

      {aConfirmer && (
        <div className="fixed inset-0 z-[70] bg-ink/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="confirmer-remplacement">
          <div className="bg-paper text-ink rounded shadow-xl max-w-md p-5 text-[0.85rem]">
            <p className="font-medium mb-2">Remplacer la composition existante ?</p>
            <p className="mb-4">
              Ce contour contient déjà une composition IA ({aConfirmer.existantes.length} plantes).
              Elle sera remplacée ; les plantes ajoutées à la main sont conservées.
            </p>
            <div className="flex justify-end gap-2">
              <button className="border border-hair-light hover:bg-paper-2 rounded px-3 py-1.5" onClick={() => setAConfirmer(null)}>Annuler</button>
              <button className="bg-brass hover:bg-brass-soft text-paper rounded px-3 py-1.5" data-testid="btn-confirmer-remplacement"
                onClick={() => { const c = aConfirmer; setAConfirmer(null); appliquer(c.pret, 1, c.existantes); }}>
                Remplacer
              </button>
            </div>
          </div>
        </div>
      )}

      {affichee && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] bg-ink text-paper rounded shadow-xl px-4 py-2.5 flex items-center gap-3 text-[0.8rem] max-w-[95vw]"
          data-testid="barre-composition">
          <span>
            <strong>Composition IA</strong> · {affichee.ids.length} plantes
            {affichee.ecarts.length > 0 && <span className="text-amber-200" data-testid="ecarts-composition"> · place insuffisante ({nomsEcarts(affichee.ecarts)})</span>}
          </span>
          <button className="bg-brass hover:bg-brass-soft rounded px-3 py-1" onClick={garder} data-testid="btn-garder-composition">Garder</button>
          <button className="border border-paper/40 hover:bg-paper/10 rounded px-3 py-1" onClick={autreProposition} data-testid="btn-autre-proposition">Autre proposition</button>
          <button className="border border-paper/40 hover:bg-paper/10 rounded px-3 py-1" onClick={annuler} data-testid="btn-annuler-composition">Annuler</button>
        </div>
      )}

      {message && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] bg-paper text-ink border border-hair-light rounded shadow px-4 py-2 text-[0.8rem]" role="status">
          {message}
          <button className="ml-3 text-stone hover:text-ink" onClick={() => setMessage(null)} aria-label="Fermer">×</button>
        </div>
      )}
    </>
  );

  return { ouvrir: () => { setMessage(null); setOuvert(true); }, rendu };
}
