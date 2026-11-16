"use client";

/**
 * Outils « Découper » (DEC) et « Bordure » (BOR) de l'étape 3.
 *
 * DEC : clic sur une surface, tracé d'une ligne ou polyligne qui la traverse, Entrée :
 * deux surfaces indépendantes (la plus grande garde l'identifiant et le matériau, ses
 * bordures suivent leurs côtés). Une seule action annulable.
 *
 * BOR : clic sur une surface (ses côtés s'affichent), clic sur un côté (Maj pour en
 * ajouter, glisser le long du contour pour en prendre plusieurs), choix du matériau
 * linéaire, Entrée : une bordure liée par suite de côtés contigus.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { Element, EtatEditeur } from "../types";
import type { Action } from "./reducer";
import { pointDansPolygone, surface as aire, dist, type Pt } from "../geo/plan";
import { decouperPolygone } from "../geo/decoupe";
import { coteProche, type Materiau } from "../materiaux/materiaux";
import { contourBordable, cotesOccupes, creerBordures, borduresApresDecoupe } from "../materiaux/bordures";
import { genererIdLocal } from "@/lib/id-client";

/** Côtés mis en évidence sur le plan pendant l'outil Bordure. */
export interface SurbrillanceCotes {
  contour: Pt[];
  choisis: number[];
  occupes: number[];
}

interface Params {
  etat: EtatEditeur;
  dispatch: React.Dispatch<Action>;
  materiaux: Materiau[];
  zoomRef: React.RefObject<number>;
}

export function useOutilsMateriaux({ etat, dispatch, materiaux, zoomRef }: Params) {
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const [cotes, setCotes] = useState<number[]>([]);
  const [materiauId, setMateriauId] = useState<string | null>(null);
  const glisseRef = useRef(false);
  const outil = etat.outil;
  const actif = outil === "bordure" || outil === "decouper";

  // Nouvel outil : on repart de zéro (mise à jour pendant le rendu, sans effet)
  const [outilPrecedent, setOutilPrecedent] = useState(outil);
  if (outil !== outilPrecedent) {
    setOutilPrecedent(outil);
    setSurfaceId(null);
    setCotes([]);
  }

  const lineaires = useMemo(() => materiaux.filter((m) => m.type === "lineaire"), [materiaux]);
  const materiauChoisi = materiauId && lineaires.some((m) => m.id === materiauId) ? materiauId : lineaires[0]?.id ?? null;
  const surface = surfaceId ? etat.elements.get(surfaceId) ?? null : null;
  const contour = surface ? contourBordable(surface) : null;
  const occupes = useMemo(() => (surface ? cotesOccupes(surface, etat.elements.values()) : new Map<number, string>()), [surface, etat.elements]);

  const message = useCallback((texte: string) => dispatch({ type: "MESSAGE", texte }), [dispatch]);

  /** Plus petite surface (polygone ou rectangle) contenant le point. */
  const surfaceSous = useCallback((pt: Pt): Element | null => {
    let meilleur: Element | null = null, a = Infinity;
    for (const el of etat.elements.values()) {
      if (el.type !== "sol" && el.type !== "mineral") continue;
      const c = contourBordable(el);
      if (!c || !pointDansPolygone(pt, c)) continue;
      const s = aire(c);
      if (s < a) { a = s; meilleur = el; }
    }
    return meilleur;
  }, [etat.elements]);

  const choisirSurface = useCallback((pt: Pt): boolean => {
    const s = surfaceSous(pt);
    if (!s) { message(outil === "bordure" ? "BOR : cliquez à l'intérieur d'un polygone ou d'un rectangle" : "DEC : cliquez à l'intérieur d'un polygone ou d'un rectangle"); return false; }
    setSurfaceId(s.id);
    setCotes([]);
    dispatch({ type: "SELECTIONNER", ids: [s.id] });
    message(outil === "bordure"
      ? "BOR : cliquez un côté (Maj pour en ajouter, glisser le long du contour), choisissez le matériau, Entrée pour créer"
      : "DEC : tracez la ligne de coupe à travers la surface, Entrée pour découper");
    return true;
  }, [surfaceSous, dispatch, message, outil]);

  /** Appui du pointeur : outil Bordure (choix de la surface et des côtés). Renvoie true si traité. */
  const surPointerDown = useCallback((pt: Pt, maj: boolean): boolean => {
    if (outil !== "bordure") return false;
    if (!surface || !contour) { choisirSurface(pt); return true; }
    const c = coteProche(surface, pt, 10 / (zoomRef.current || 1));
    if (c === null) {
      const autre = surfaceSous(pt);
      if (autre && autre.id !== surface.id) choisirSurface(pt);
      return true;
    }
    if (occupes.has(c)) { message("BOR : ce côté porte déjà une bordure"); return true; }
    setCotes((prev) => (maj ? (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]) : [c]));
    glisseRef.current = true;
    return true;
  }, [outil, surface, contour, choisirSurface, zoomRef, surfaceSous, occupes, message]);

  /** Glisser le long du contour : les côtés survolés s'ajoutent. */
  const surPointerMove = useCallback((pt: Pt) => {
    if (!glisseRef.current || outil !== "bordure" || !surface) return;
    const c = coteProche(surface, pt, 10 / (zoomRef.current || 1));
    if (c !== null && !occupes.has(c)) setCotes((prev) => (prev.includes(c) ? prev : [...prev, c]));
  }, [outil, surface, zoomRef, occupes]);

  const surPointerUp = useCallback(() => { glisseRef.current = false; }, []);

  /** Clic : outil Découper (choix de la surface puis points de la ligne de coupe). */
  const surClic = useCallback((pt: Pt): boolean => {
    if (outil !== "decouper") return false;
    if (!surface) { choisirSurface(pt); return true; }
    dispatch({ type: "AJOUTER_POINT", point: pt });
    return true;
  }, [outil, surface, choisirSurface, dispatch]);

  const creerBordure = useCallback(() => {
    if (!surface) { message("BOR : cliquez d'abord une surface"); return; }
    if (!materiauChoisi) { message("BOR : aucun matériau linéaire dans la bibliothèque"); return; }
    const r = creerBordures({ surface, cotes, materiauId: materiauChoisi, existants: etat.elements.values(), genererId: genererIdLocal, ordre: etat.elements.size });
    if (!r.ok) { message(`BOR : ${r.erreur}`); return; }
    dispatch({ type: "MODIFIER_ELEMENTS", elements: r.elements });
    setCotes([]);
    const nom = lineaires.find((m) => m.id === materiauChoisi)?.nom ?? "Bordure";
    message(`BOR : ${nom} posée. Choisissez d'autres côtés, ou Échap pour terminer`);
  }, [surface, materiauChoisi, cotes, etat.elements, dispatch, lineaires, message]);

  const decouper = useCallback(() => {
    if (!surface || !contour) { message("DEC : cliquez d'abord une surface"); return; }
    const r = decouperPolygone(contour, etat.traceEnCours);
    if (!r.ok) { message(`DEC : ${r.erreur}`); return; }
    const [p0, p1] = r.parties;
    const [grande, petite] = aire(p0.points) >= aire(p1.points) ? [p0, p1] : [p1, p0];
    const idPetite = genererIdLocal();
    const proprietesPetite = { ...surface.proprietes };
    delete proprietesPetite.materiau_id;
    const elGrande: Element = { ...surface, geometrie: { type: "polygone", points: grande.points } };
    const elPetite: Element = { ...surface, id: idPetite, geometrie: { type: "polygone", points: petite.points }, proprietes: proprietesPetite, ordre: etat.elements.size };
    const liees = [...etat.elements.values()].filter((el) => el.proprietes.bordure_de === surface.id);
    const bordures = borduresApresDecoupe({ bordures: liees, parties: [grande, petite], idsParties: [surface.id, idPetite], genererId: genererIdLocal });
    const gardees = new Set(bordures.map((b) => b.id));
    dispatch({
      type: "MODIFIER_ELEMENTS",
      elements: [elGrande, elPetite, ...bordures],
      suppressions: liees.filter((b) => !gardees.has(b.id)).map((b) => b.id),
    });
    dispatch({ type: "ANNULER_TRACE" });
    setSurfaceId(null);
    dispatch({ type: "SELECTIONNER", ids: [surface.id, idPetite] });
    message(`DEC : surface découpée (${aire(grande.points).toFixed(1).replace(".", ",")} m² et ${aire(petite.points).toFixed(1).replace(".", ",")} m²)`);
  }, [surface, contour, etat.traceEnCours, etat.elements, dispatch, message]);

  /** Entrée : créer la bordure, ou découper. Renvoie true si traité. */
  const surEntree = useCallback((): boolean => {
    if (outil === "bordure") { creerBordure(); return true; }
    if (outil === "decouper") { decouper(); return true; }
    return false;
  }, [outil, creerBordure, decouper]);

  /** Échap : abandonne la surface en cours ; sans surface en cours, quitte l'outil. */
  const surEchap = useCallback(() => {
    glisseRef.current = false;
    if (actif && !surfaceId) { dispatch({ type: "CHANGER_OUTIL", outil: "selection" }); return; }
    setSurfaceId(null);
    setCotes([]);
  }, [actif, surfaceId, dispatch]);

  const surbrillance: SurbrillanceCotes | null = outil === "bordure" && contour
    ? { contour, choisis: cotes, occupes: [...occupes.keys()] }
    : null;

  const longueurChoisie = contour ? cotes.reduce((s, i) => s + dist(contour[i], contour[(i + 1) % contour.length]), 0) : 0;

  const panneau: ReactNode = outil === "bordure" ? (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/95 rounded shadow border border-hair-light p-3 w-80 text-[0.78rem]" data-testid="panneau-bordure"
      // Entrée depuis le panneau (choix du matériau au clavier) : créer la bordure
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); creerBordure(); } }}>
      <p className="font-medium mb-1">Bordure</p>
      {!surface ? (
        <p className="text-stone">Cliquez la surface à border.</p>
      ) : (
        <>
          <p className="text-stone mb-2" data-testid="bordure-cotes">
            {cotes.length === 0 ? "Cliquez un côté (Maj pour en ajouter, glisser pour en prendre plusieurs)."
              : `${cotes.length} côté${cotes.length > 1 ? "s" : ""} · ${longueurChoisie.toFixed(2).replace(".", ",")} ml`}
          </p>
          <div className="space-y-1 mb-2">
            {lineaires.map((m) => (
              <label key={m.id} className="flex items-center gap-2 cursor-pointer" data-testid={`bordure-materiau-${m.id}`}>
                <input type="radio" name="materiau-bordure" checked={materiauChoisi === m.id}
                  // Le clavier revient à l'éditeur (Entrée, commandes) après le choix
                  onChange={(e) => { setMateriauId(m.id); e.currentTarget.blur(); }} />
                <span className="inline-block w-5 h-1.5 rounded" style={{ background: m.couleur }} />
                {m.nom}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="bg-brass hover:bg-brass-soft text-paper rounded px-3 py-1 disabled:opacity-50" disabled={cotes.length === 0 || !materiauChoisi}
              onClick={creerBordure} data-testid="btn-creer-bordure">Créer la bordure (Entrée)</button>
            <button className="border border-hair-light rounded px-3 py-1 hover:bg-paper-2" onClick={() => dispatch({ type: "CHANGER_OUTIL", outil: "selection" })}>Terminer</button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return { actif, surPointerDown, surPointerMove, surPointerUp, surClic, surEntree, surEchap, surbrillance, panneau };
}
