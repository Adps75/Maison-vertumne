/**
 * Hook d'interaction 3D pour les végétaux.
 * Vit côté DOM (hors Canvas R3F). Produit des callbacks pour les composants R3F.
 *
 * Toute l'interaction (clic, drag) passe par GestionnairePointeurTerrain
 * qui gère les événements natifs du canvas DOM + raycasting manuel.
 * Les composants Vegetal.tsx sont purement visuels (pas de pointer events).
 */

import { useState, useCallback, useRef } from "react";
import type { Element } from "../types";
import type { PlanteSelectionnee } from "../types";
import type { Action } from "../editeur/reducer";
import { genererIdLocal } from "@/lib/id-client";
import { positionValideLaPlusProche, extraireVoisines, rayonEcartement } from "../vegetaux/ecartement";

type Mode = "idle" | "placement" | "drag";

interface Params {
  dispatch: React.Dispatch<Action>;
  elements: Map<string, Element>;
  selection: Set<string>;
  altitudeEn: ((x: number, y: number) => number) | null;
  tolerance: number;
  zoneContour?: [number, number][] | null;
}

/** Convertit un point d'intersection Three.js en coordonnées plan. */
export function threeVersPlan(x: number, z: number): [number, number] {
  return [x, -z];
}

/** Callbacks utilisés par GestionnairePointeurTerrain (événements DOM natifs). */
export interface RaycastCallbacks {
  /** Clic terrain (pas sur une plante). */
  onTerrainClick: (planX: number, planY: number) => void;
  /** Mouvement sur terrain (preview placement ou drag). */
  onTerrainMove: (planX: number, planY: number) => void;
  /** Pointerdown sur une plante (par raycasting de la scène). */
  onVegetalDown: (elementId: string, terrainX: number, terrainY: number) => void;
  /** Pointerup après un drag ou un clic. */
  onPointerUp: (terrainX: number | null, terrainY: number | null) => void;
  /** Clic hors terrain (ciel, bâtiment). */
  onMissClick: () => void;
  /** Geste interrompu par le navigateur (pointercancel) : annule le glisser. */
  onPointerCancel: () => void;
  /** Placement en cours : un clic vise le sol, même au-dessus d'une plante existante. */
  placementActif: boolean;
}

const SEUIL_DRAG_PX = 3;

export function useInteractionVegetaux3D({ dispatch, elements, selection, altitudeEn, tolerance, zoneContour }: Params) {
  const [mode, setMode] = useState<Mode>("idle");
  const [planteAPoser, setPlanteAPoser] = useState<PlanteSelectionnee | null>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  // Refs pour le drag
  const isDraggingRef = useRef(false);
  const dragElementIdRef = useRef<string | null>(null);
  const dragOrigPosRef = useRef<[number, number] | null>(null);
  const previewPositionRef = useRef<[number, number] | null>(null);
  const dragPositionRef = useRef<[number, number] | null>(null);
  // Écart entre le point cliqué et le pied de la plante
  const dragOffsetRef = useRef<[number, number]>([0, 0]);
  // Pending drag : attend un mouvement > seuil avant de passer en mode drag
  const dragPendingRef = useRef(false);
  const downScreenRef = useRef<[number, number] | null>(null);
  // Shift key pour forcer le placement sans écartement
  const shiftKeyRef = useRef(false);

  const activerPlacement = useCallback((plante: PlanteSelectionnee) => {
    setPlanteAPoser(plante);
    setMode("placement");
    setMessageErreur(null);
    dispatch({ type: "DESELECTIONNER" });
  }, [dispatch]);

  const annulerPlacement = useCallback(() => {
    setPlanteAPoser(null);
    previewPositionRef.current = null;
    setMode("idle");
  }, []);

  // --- Callbacks utilisés par TerrainRaycastHandler ---

  const onTerrainClick = useCallback((planX: number, planY: number) => {
    setMessageErreur(null);
    if (mode === "placement" && planteAPoser) {
      const voisines = extraireVoisines(elements);
      const planteInfo = {
        id: "", position: [planX, planY] as [number, number],
        rayon: rayonEcartement({ largeur_3ans_m: planteAPoser.largeur_3ans_m, diametre_m: planteAPoser.diametre_m }),
        categorie: planteAPoser.categorie, forme: planteAPoser.forme,
      };
      const pos = shiftKeyRef.current
        ? [planX, planY] as [number, number]
        : positionValideLaPlusProche(planteInfo, [planX, planY], voisines, tolerance, zoneContour);
      const element: Element = {
        id: genererIdLocal(),
        type: "vegetal",
        geometrie: { type: "point", position: pos },
        calque: "vegetal",
        statut: "nouveau",
        hauteur: planteAPoser.hauteur_m,
        proprietes: {
          plante_id: planteAPoser.id,
          nom_commun: planteAPoser.nom_commun,
          nom_latin: planteAPoser.nom_latin,
          diametre_m: planteAPoser.diametre_m,
          largeur_3ans_m: planteAPoser.largeur_3ans_m,
          hauteur_m: planteAPoser.hauteur_m,
          version: planteAPoser.version,
          categorie: planteAPoser.categorie,
          forme: planteAPoser.forme,
          rotation: 0,
        },
        ordre: elements.size,
      };
      dispatch({ type: "CREER_ELEMENT", element });
      return;
    }
    if (mode === "idle") {
      dispatch({ type: "DESELECTIONNER" });
    }
  }, [mode, planteAPoser, dispatch, elements, tolerance, zoneContour]);

  const onTerrainMove = useCallback((planX: number, planY: number) => {
    if (mode === "placement") {
      previewPositionRef.current = [planX, planY];
    }
  }, [mode]);

  const onVegetalDown = useCallback((elementId: string, terrainX: number, terrainY: number) => {
    if (mode === "placement") return;

    const el = elements.get(elementId);
    if (!el || el.geometrie.type !== "point") return;

    const plantPos = el.geometrie.position;
    dragPendingRef.current = true;
    dragElementIdRef.current = elementId;
    dragOrigPosRef.current = [plantPos[0], plantPos[1]];
    dragOffsetRef.current = [plantPos[0] - terrainX, plantPos[1] - terrainY];
    dragPositionRef.current = null;
    dispatch({ type: "SELECTIONNER", ids: [elementId] });
  }, [mode, elements, dispatch]);

  const onPointerUp = useCallback((terrainX: number | null, terrainY: number | null) => {
    // Clic simple sur une plante (pas de drag)
    if (dragPendingRef.current && !isDraggingRef.current) {
      dragPendingRef.current = false;
      // Sélection déjà faite dans onVegetalDown
      dragElementIdRef.current = null;
      dragOrigPosRef.current = null;
      return;
    }

    // Fin de drag
    if (isDraggingRef.current && dragElementIdRef.current) {
      if (terrainX != null && terrainY != null) {
        let finalX = terrainX + dragOffsetRef.current[0];
        let finalY = terrainY + dragOffsetRef.current[1];
        const el = elements.get(dragElementIdRef.current);
        if (el && el.geometrie.type === "point") {
          // Appliquer l'écartement (sauf Maj)
          if (!shiftKeyRef.current) {
            const voisines = extraireVoisines(elements).filter((v) => v.id !== el.id);
            const planteInfo = {
              id: el.id, position: [finalX, finalY] as [number, number],
              rayon: rayonEcartement(el.proprietes),
              categorie: (el.proprietes.categorie as string) ?? "vivace",
              forme: (el.proprietes.forme as string) ?? null,
            };
            [finalX, finalY] = positionValideLaPlusProche(planteInfo, [finalX, finalY], voisines, tolerance, zoneContour);
          }
          dispatch({
            type: "MODIFIER_ELEMENTS",
            elements: [{ ...el, geometrie: { ...el.geometrie, position: [finalX, finalY] } }],
          });
        }
      }
      isDraggingRef.current = false;
      dragElementIdRef.current = null;
      dragOrigPosRef.current = null;
      dragPositionRef.current = null;
      dragOffsetRef.current = [0, 0];
      setMode("idle");
      return;
    }

    dragPendingRef.current = false;
  }, [elements, dispatch, tolerance, zoneContour]);

  /** Annule un glisser en cours sans rien modifier (pointercancel). */
  const onPointerCancel = useCallback(() => {
    const enGlisser = isDraggingRef.current;
    isDraggingRef.current = false;
    dragPendingRef.current = false;
    dragElementIdRef.current = null;
    dragOrigPosRef.current = null;
    dragPositionRef.current = null;
    dragOffsetRef.current = [0, 0];
    downScreenRef.current = null;
    if (enGlisser) setMode("idle");
  }, []);

  const onMissClick = useCallback(() => {
    if (mode === "placement") {
      setMessageErreur("Cliquez sur le sol");
      setTimeout(() => setMessageErreur(null), 2000);
    }
  }, [mode]);

  /** Met à jour la touche Shift (appelé depuis le DOM event handler). */
  const updateShift = useCallback((shift: boolean) => {
    shiftKeyRef.current = shift;
  }, []);

  /** Appelé par GestionnairePointeurTerrain pendant un mouvement terrain (drag ou preview). */
  const onDragMove = useCallback((screenX: number, screenY: number, terrainX: number, terrainY: number) => {
    // Preview pendant placement
    if (mode === "placement") {
      previewPositionRef.current = [terrainX, terrainY];
      return;
    }

    // Seuil de drag
    if (dragPendingRef.current && !isDraggingRef.current && downScreenRef.current) {
      const dx = screenX - downScreenRef.current[0];
      const dy = screenY - downScreenRef.current[1];
      if (Math.sqrt(dx * dx + dy * dy) < SEUIL_DRAG_PX) return;
      // Seuil dépassé → passer en drag
      isDraggingRef.current = true;
      dragPendingRef.current = false;
      setMode("drag");
    }

    // Position pendant le drag
    if (isDraggingRef.current) {
      dragPositionRef.current = [
        terrainX + dragOffsetRef.current[0],
        terrainY + dragOffsetRef.current[1],
      ];
    }
  }, [mode]);

  const raycastCallbacks: RaycastCallbacks = {
    onTerrainClick,
    onTerrainMove,
    onVegetalDown,
    onPointerUp,
    onMissClick,
    onPointerCancel,
    placementActif: mode === "placement",
  };

  return {
    mode,
    planteAPoser,
    messageErreur,
    previewPositionRef,
    dragPositionRef,
    isDraggingRef,
    dragElementIdRef,
    downScreenRef,
    raycastCallbacks,
    onDragMove,
    activerPlacement,
    updateShift,
    annulerPlacement,
  };
}
