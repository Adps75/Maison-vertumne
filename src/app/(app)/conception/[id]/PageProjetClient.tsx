"use client";

import { useEffect, useState, useReducer, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  reducer,
  etatInitial,
  getChangements,
  type Action,
} from "@/modules/conception/editeur/reducer";
import { COMMANDES, parseSaisie } from "@/modules/conception/editeur/commandes";
import { dist as distPlan } from "@/modules/conception/geo/plan";
import {
  planifierSauvegarde,
  setUpdatedAt,
  type StatutSauvegarde,
} from "@/modules/conception/editeur/sauvegarde";
import { BarreOutils } from "@/modules/conception/composants/BarreOutils";
import { PanneauCalques } from "@/modules/conception/composants/PanneauCalques";
import { PanneauInfos } from "@/modules/conception/composants/PanneauInfos";
import { BarreSaisie } from "@/modules/conception/composants/BarreSaisie";
import { BarreEtapes } from "@/modules/conception/composants/BarreEtapes";
import { PanneauZones } from "@/modules/conception/composants/PanneauZones";
import { genererIdLocal } from "@/lib/id-client";
import { ecranVersTerrain } from "@/modules/conception/geo/canevas";
import { trouverAccrochage, contrainteOrtho } from "@/modules/conception/editeur/accrochage";
import type { Element, Geometrie, NomOutil, Accrochage as AccrochageType, NumeroEtape } from "@/modules/conception/types";
import { elementSelectionnableAEtape, outilDisponibleAEtape, etapePourOutil, ETAPES_LABELS } from "@/modules/conception/types";
import { deplacerGeometrie, copierGeometrie, rotationGeometrie, miroirGeometrie } from "@/modules/conception/editeur/transformation";
import { dist as distPt } from "@/modules/conception/geo/plan";
import type { Pt } from "@/modules/conception/geo/plan";
import { hitTestGeometrique, elementSurvole, selectionParRectangle } from "@/modules/conception/editeur/selection";
import { PanneauVegetaux } from "@/modules/conception/composants/PanneauVegetaux";
import { PanneauListeVegetaux } from "@/modules/conception/composants/PanneauListeVegetaux";
import { calculerNouveauDiametre } from "@/modules/conception/editeur/poignees";
import {
  appliquerDeplacementPoignee,
  supprimerSommet,
  extrairePoignees,
  trouverPoignee,
  type Poignee,
} from "@/modules/conception/editeur/poignees";

const CanevasEditeur = dynamic(
  () =>
    import("@/modules/conception/composants/CanevasEditeur").then(
      (m) => m.CanevasEditeur,
    ),
  { ssr: false, loading: () => <div className="w-full h-full bg-paper-2 animate-pulse" /> },
);

interface Projet {
  id: string;
  nom: string;
  updated_at: string;
  parcelles_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  batiments_geojson: {
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    hauteur: number | null;
    cleabs: string;
  }[];
  ortho_url: string | null;
  ortho_emprise: [number, number, number, number] | null;
}

export function PageProjetClient() {
  const { id } = useParams<{ id: string }>();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, dispatch] = useReducer(reducer, undefined, etatInitial);
  const [sauvegarde, setSauvegarde] = useState<StatutSauvegarde>("sauvegarde");

  // Refs pour la couche interactive (pas de re-render React au mouvement)
  const curseurRef = useRef<Pt>([0, 0]);
  const accrochageRef = useRef<AccrochageType | null>(null);
  const zoomRef = useRef(1);
  const saisieRef = useRef("");

  // État des outils d'édition (point de base, axe miroir)
  const [editBase, setEditBase] = useState<Pt | null>(null);
  const [editAxeA, setEditAxeA] = useState<Pt | null>(null);

  // Sélection par rectangle
  const [rectDebut, setRectDebut] = useState<Pt | null>(null);
  const rectFinRef = useRef<Pt | null>(null);
  const shiftKeyRef = useRef(false);

  // Poignées
  const [poigneeActive, setPoigneeActive] = useState<Poignee | null>(null);
  const [sommetSelectionne, setSommetSelectionne] = useState<{ elementId: string; index: number } | null>(null);
  const survoleRef = useRef<string | null>(null);
  const poigneeSurvoleRef = useRef<Poignee | null>(null);
  const poigneePreviewRef = useRef<Pt | null>(null); // Position actuelle de la poignée glissée


  // Glisser-déposer
  const pointerDownPtRef = useRef<Pt | null>(null); // Point de pointerdown
  const pointerDownElementRef = useRef<string | null>(null); // ID de l'élément sous le pointerdown
  const dragActiveRef = useRef(false);
  const dragIdsRef = useRef<Set<string> | null>(null);
  const dragBaseRef = useRef<Pt | null>(null); // Point de saisie
  const dragDeltaRef = useRef<Pt | null>(null); // Delta courant
  const dragAltRef = useRef(false); // Alt enfoncé pendant le drag
  const SEUIL_DRAG = 3; // pixels écran

  // Phase des outils d'édition (AutoCAD)
  type PhaseEdition = "selection" | "base" | "destination";
  const [phaseEdition, setPhaseEdition] = useState<PhaseEdition>("selection");

  // Track Shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") shiftKeyRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") shiftKeyRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Helper pour créer un élément
  const creerElement = useCallback(
    (gType: "polyligne" | "polygone", points: Pt[]) => {
      const element: Element = {
        id: genererIdLocal(),
        type: gType === "polygone" ? "sol" : "limite",
        geometrie: { type: gType, points },
        calque: etat.calqueActif,
        statut: "nouveau",
        hauteur: null,
        proprietes: {},
        ordre: etat.elements.size,
      };
      dispatch({ type: "CREER_ELEMENT", element });
      dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
    },
    [etat.calqueActif, etat.elements.size],
  );

  // Charger le projet et les éléments
  useEffect(() => {
    Promise.all([
      fetch(`/api/conception/projets/${id}`).then((r) => r.json()),
      fetch(`/api/conception/projets/${id}/elements`).then((r) => r.json()),
    ])
      .then(([projetData, elementsData]) => {
        if (projetData.ok) {
          setProjet(projetData.projet);
          setUpdatedAt(projetData.projet.updated_at);
        } else {
          setErreur(projetData.error);
        }
        if (elementsData.ok && elementsData.elements) {
          dispatch({ type: "CHARGER_ELEMENTS", elements: elementsData.elements });
        }
      })
      .catch(() => setErreur("Impossible de charger le projet."))
      .finally(() => setChargement(false));
  }, [id]);

  // Garder saisieRef en sync
  useEffect(() => { saisieRef.current = etat.saisie; }, [etat.saisie]);

  // Quand l'outil change, initialiser la phase d'édition
  useEffect(() => {
    if (["deplacer", "copier", "rotation", "miroir"].includes(etat.outil)) {
      if (etat.selection.size > 0) {
        setPhaseEdition("base");
      } else {
        setPhaseEdition("selection");
      }
      setEditBase(null);
      setEditAxeA(null);
    } else {
      setPhaseEdition("selection");
    }
    // Toujours nettoyer le rectangle de sélection au changement d'outil
    setRectDebut(null);
  }, [etat.outil]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exposer l'état pour les tests E2E (dev/test uniquement)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__editeurTest = {
        elements: etat.elements,
        etape: etat.etape,
        selection: etat.selection,
      };
    }
    return () => {
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as Record<string, unknown>).__editeurTest;
      }
    };
  }, [etat.elements, etat.etape, etat.selection]);

  // Planifier la sauvegarde après chaque action qui modifie les éléments
  useEffect(() => {
    const c = getChangements();
    if (c.upserts.length > 0 || c.suppressions.length > 0) {
      planifierSauvegarde(id, setSauvegarde);
    }
  }, [etat.elements, id]);

  // Extraire les points de la parcelle pour l'accrochage
  const parcellePoints: Pt[] = [];
  if (projet?.parcelles_geojson) {
    const rings =
      projet.parcelles_geojson.type === "MultiPolygon"
        ? projet.parcelles_geojson.coordinates.flat(1)
        : projet.parcelles_geojson.coordinates;
    for (const ring of rings) {
      for (const [x, y] of ring) parcellePoints.push([x, y]);
    }
  }

  const batimentsPoints: Pt[][] = (projet?.batiments_geojson ?? []).map((b) => {
    const rings =
      b.geometry.type === "MultiPolygon"
        ? b.geometry.coordinates.flat(1)
        : b.geometry.coordinates;
    return rings[0]?.map(([x, y]) => [x, y] as Pt) ?? [];
  });

  // Mouvement du pointeur — met à jour les refs sans re-render
  const onPointerMoveHandler = useCallback(
    (terrainPt: Pt) => {

      let pt = terrainPt;

      // Mode ortho (pendant le tracé ou le drag)
      if (etat.modeOrtho) {
        if (etat.traceEnCours.length > 0) {
          pt = contrainteOrtho(etat.traceEnCours[etat.traceEnCours.length - 1], pt);
        } else if (dragActiveRef.current && dragBaseRef.current) {
          pt = contrainteOrtho(dragBaseRef.current, pt);
        }
      }

      // Accrochage
      if (etat.accrochageActif) {
        const elements = Array.from(etat.elements.values());
        const acc = trouverAccrochage(pt, elements, parcellePoints, batimentsPoints, zoomRef.current);
        if (acc) {
          pt = acc.point;
          accrochageRef.current = acc;
        } else {
          accrochageRef.current = null;
        }
      } else {
        accrochageRef.current = null;
      }

      curseurRef.current = pt;

      // Détection du seuil de drag (3 px) — pas pendant un tracé en cours
      if (pointerDownPtRef.current && !dragActiveRef.current && !poigneeActive && !rectDebut && etat.traceEnCours.length === 0) {
        const distPx = distPt(pointerDownPtRef.current, terrainPt) * zoomRef.current;
        if (distPx > SEUIL_DRAG) {
          const elId = pointerDownElementRef.current;
          if (elId) {
            // Démarrer le drag (fonctionne quel que soit l'outil actif)
            dragActiveRef.current = true;
            dragBaseRef.current = pointerDownPtRef.current;
            if (etat.selection.has(elId)) {
              dragIdsRef.current = new Set(etat.selection);
            } else {
              dragIdsRef.current = new Set([elId]);
              dispatch({ type: "SELECTIONNER", ids: [elId] });
            }
            dragDeltaRef.current = [0, 0];
          } else if (etat.outil === "selection") {
            // Démarrer la sélection rectangle (uniquement en mode sélection)
            setRectDebut(pointerDownPtRef.current);
          }
          pointerDownPtRef.current = null;
        }
      }

      // Pendant un drag actif → mettre à jour le delta
      if (dragActiveRef.current && dragBaseRef.current) {
        dragDeltaRef.current = [pt[0] - dragBaseRef.current[0], pt[1] - dragBaseRef.current[1]];
      }

      // Pendant un glissement de poignée → mettre à jour la preview
      if (poigneeActive) {
        poigneePreviewRef.current = pt;
      } else if (etat.outil === "selection" && !rectDebut && !dragActiveRef.current) {
        // Détection du survol de poignée (prioritaire sur l'élément)
        const selectedEls = Array.from(etat.selection)
          .map((sid) => etat.elements.get(sid))
          .filter(Boolean) as Element[];
        const toutesPoignees = selectedEls.flatMap((el) => extrairePoignees(el));
        const pSurvol = trouverPoignee(pt, toutesPoignees, 8, zoomRef.current);
        poigneeSurvoleRef.current = pSurvol;

        // Survol d'élément (seulement si pas sur une poignée ; filtré par étape)
        if (!pSurvol) {
          const elements = Array.from(etat.elements.values())
            .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
          survoleRef.current = elementSurvole(pt, elements, etat.calques, zoomRef.current);
        } else {
          survoleRef.current = null;
        }
      }
    },
    [etat.accrochageActif, etat.modeOrtho, etat.traceEnCours, etat.elements, etat.calques, etat.outil, etat.selection, etat.etape, parcellePoints, batimentsPoints, rectDebut, poigneeActive],
  );

  // Pointer down — enregistre le point pour distinguer clic/drag
  const onPointerDownHandler = useCallback(
    (pt: Pt) => {


      // Pas de drag pendant un tracé en cours
      if (etat.traceEnCours.length > 0) {
        pointerDownPtRef.current = pt;
        pointerDownElementRef.current = null;
        return;
      }

      // Tester si on est sur une poignée (priorité absolue)
      if (etat.outil === "selection") {
        const selectedEls = Array.from(etat.selection)
          .map((sid) => etat.elements.get(sid))
          .filter(Boolean) as Element[];
        const toutesPoignees = selectedEls.flatMap((el) => extrairePoignees(el));
        const poignee = trouverPoignee(pt, toutesPoignees, 8, zoomRef.current);
        if (poignee) {
          setPoigneeActive(poignee);
          setSommetSelectionne({ elementId: poignee.elementId, index: poignee.index });
          poigneePreviewRef.current = pt;
          return;
        }
      }

      // Tester si on est sur un élément sélectionnable (pour drag potentiel)
      const elements = Array.from(etat.elements.values())
        .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
      const touche = hitTestGeometrique(pt, elements, etat.calques, zoomRef.current);
      pointerDownPtRef.current = pt;
      pointerDownElementRef.current = touche?.id ?? null;
    },
    [etat.outil, etat.selection, etat.elements, etat.calques, etat.etape],
  );

  // Clic sur le canevas
  const onClicCanevas = useCallback(
    (terrainPt: Pt) => {
      const pt = curseurRef.current; // Utilise le point après accrochage/ortho

      switch (etat.outil) {
        case "polyligne":
        case "polygone": {
          // Fermer si clic sur le premier point (tolérance 1m)
          if (
            etat.traceEnCours.length >= 3 &&
            distPt(pt, etat.traceEnCours[0]) < 1
          ) {
            creerElement("polygone", [...etat.traceEnCours]);
            break;
          }
          dispatch({ type: "AJOUTER_POINT", point: pt });
          break;
        }

        case "rectangle":
          if (etat.traceEnCours.length === 0) {
            dispatch({ type: "AJOUTER_POINT", point: pt });
          } else {
            const p1 = etat.traceEnCours[0];
            const element: Element = {
              id: genererIdLocal(),
              type: "sol",
              geometrie: {
                type: "rectangle",
                points: [p1, [pt[0], p1[1]], pt, [p1[0], pt[1]]],
              },
              calque: etat.calqueActif,
              statut: "nouveau",
              hauteur: null,
              proprietes: {},
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element });
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "cercle":
          if (etat.traceEnCours.length === 0) {
            dispatch({ type: "AJOUTER_POINT", point: pt });
          } else {
            const centre = etat.traceEnCours[0];
            const rayon = Math.sqrt(
              (pt[0] - centre[0]) ** 2 + (pt[1] - centre[1]) ** 2,
            );
            const element: Element = {
              id: genererIdLocal(),
              type: "sol",
              geometrie: { type: "cercle", centre, rayon },
              calque: etat.calqueActif,
              statut: "nouveau",
              hauteur: null,
              proprietes: {},
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element });
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "arc":
          dispatch({ type: "AJOUTER_POINT", point: pt });
          if (etat.traceEnCours.length === 2) {
            // 3 points → calculer l'arc
            const [p1, p2] = etat.traceEnCours;
            const p3 = pt;
            const arc = calculerArcDepuis3Points(p1, p2, p3);
            if (arc) {
              const element: Element = {
                id: genererIdLocal(),
                type: "limite",
                geometrie: arc,
                calque: etat.calqueActif,
                statut: "nouveau",
                hauteur: null,
                proprietes: {},
                ordre: etat.elements.size,
              };
              dispatch({ type: "CREER_ELEMENT", element });
            }
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "cote":
          dispatch({ type: "AJOUTER_POINT", point: pt });
          if (etat.traceEnCours.length === 2) {
            // 3ème clic : position du décalage
            const p1 = etat.traceEnCours[0];
            const p2 = etat.traceEnCours[1];
            const distance = distPt(p1, p2);
            // Décalage = distance perpendiculaire du 3ème clic au segment p1-p2
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? -dy / len : 0;
            const ny = len > 0 ? dx / len : 1;
            const decalage = (pt[0] - p1[0]) * nx + (pt[1] - p1[1]) * ny;

            const element: Element = {
              id: genererIdLocal(),
              type: "cote",
              geometrie: {
                type: "cote",
                p1,
                p2,
                decalage,
                distance: Math.round(distance * 100) / 100,
              },
              calque: "cotes",
              statut: "nouveau",
              hauteur: null,
              proprietes: {},
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element });
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "texte": {
          const texte = prompt("Texte :");
          if (texte) {
            const element: Element = {
              id: genererIdLocal(),
              type: "annotation",
              geometrie: { type: "point", position: pt },
              calque: "annotations",
              statut: "nouveau",
              hauteur: null,
              proprietes: { texte },
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element });
          }
          dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          break;
        }

        case "selection": {
          // Sélection d'élément (filtré par étape)
          // Les poignées et le drag sont gérés par onPointerDown/Up
          const elements = Array.from(etat.elements.values())
            .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
          const touche = hitTestGeometrique(pt, elements, etat.calques, zoomRef.current);
          if (touche) {
            dispatch({ type: "SELECTIONNER", ids: [touche.id], ajouter: shiftKeyRef.current });
          } else {
            dispatch({ type: "DESELECTIONNER" });
          }
          break;
        }

        case "deplacer":
        case "copier":
          if (phaseEdition === "selection") {
            const elements = Array.from(etat.elements.values())
              .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
            const touche = hitTestGeometrique(pt, elements, etat.calques, zoomRef.current);
            if (touche) dispatch({ type: "SELECTIONNER", ids: [touche.id], ajouter: shiftKeyRef.current });
            break;
          }
          if (phaseEdition === "base") {
            setEditBase(pt);
            setPhaseEdition("destination");
            dispatch({ type: "SAISIE", texte: "" });
            dispatch({ type: "CHANGER_OUTIL", outil: etat.outil, message: "Point de destination (ou longueur au clavier)" });
            break;
          }
          if (phaseEdition === "destination" && editBase) {
            const dx = pt[0] - editBase[0];
            const dy = pt[1] - editBase[1];
            const modifies = Array.from(etat.selection)
              .map((sid) => etat.elements.get(sid))
              .filter(Boolean) as Element[];

            if (etat.outil === "deplacer") {
              dispatch({
                type: "MODIFIER_ELEMENTS",
                elements: modifies.map((el) => ({
                  ...el,
                  geometrie: deplacerGeometrie(el.geometrie, dx, dy),
                })),
              });
              setEditBase(null);
              setPhaseEdition("selection");
              dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
            } else {
              // Copier : créer les copies, rester actif pour plusieurs copies
              modifies.forEach((el) => {
                dispatch({
                  type: "CREER_ELEMENT",
                  element: {
                    ...el,
                    id: genererIdLocal(),
                    geometrie: copierGeometrie(el.geometrie, dx, dy),
                  },
                });
              });
              // Rester en phase destination pour une autre copie
            }
          }
          break;

        case "rotation":
          if (phaseEdition === "selection") {
            const elements = Array.from(etat.elements.values())
              .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
            const touche = hitTestGeometrique(pt, elements, etat.calques, zoomRef.current);
            if (touche) dispatch({ type: "SELECTIONNER", ids: [touche.id], ajouter: shiftKeyRef.current });
            break;
          }
          if (phaseEdition === "base") {
            setEditBase(pt);
            setPhaseEdition("destination");
            dispatch({ type: "SAISIE", texte: "" });
            dispatch({ type: "CHANGER_OUTIL", outil: "rotation", message: "Angle de rotation (clic ou saisir en degrés)" });
            break;
          }
          if (phaseEdition === "destination" && editBase) {
            // Angle par clic : angle entre base et pt
            const angle = (Math.atan2(pt[1] - editBase[1], pt[0] - editBase[0]) * 180) / Math.PI;
            const modifies = Array.from(etat.selection)
              .map((sid) => etat.elements.get(sid))
              .filter(Boolean) as Element[];
            dispatch({
              type: "MODIFIER_ELEMENTS",
              elements: modifies.map((el) => ({
                ...el,
                geometrie: rotationGeometrie(el.geometrie, editBase, angle),
              })),
            });
            setEditBase(null);
            setPhaseEdition("selection");
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "miroir":
          if (phaseEdition === "selection") {
            const elements = Array.from(etat.elements.values())
              .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
            const touche = hitTestGeometrique(pt, elements, etat.calques, zoomRef.current);
            if (touche) dispatch({ type: "SELECTIONNER", ids: [touche.id], ajouter: shiftKeyRef.current });
            break;
          }
          if (phaseEdition === "base") {
            setEditAxeA(pt);
            setPhaseEdition("destination");
            dispatch({ type: "SAISIE", texte: "" });
            dispatch({ type: "CHANGER_OUTIL", outil: "miroir", message: "Deuxième point de l'axe" });
            break;
          }
          if (phaseEdition === "destination" && editAxeA) {
            const modifies = Array.from(etat.selection)
              .map((sid) => etat.elements.get(sid))
              .filter(Boolean) as Element[];
            dispatch({
              type: "MODIFIER_ELEMENTS",
              elements: modifies.map((el) => ({
                ...el,
                geometrie: miroirGeometrie(el.geometrie, editAxeA, pt),
              })),
            });
            setEditAxeA(null);
            setPhaseEdition("selection");
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "planter": {
          if (!etat.planteSelectionnee) break;
          const ps = etat.planteSelectionnee;
          const element: Element = {
            id: genererIdLocal(),
            type: "vegetal",
            geometrie: { type: "point", position: pt },
            calque: "vegetal",
            statut: "nouveau",
            hauteur: ps.hauteur_m,
            proprietes: {
              plante_id: ps.id,
              nom_commun: ps.nom_commun,
              nom_latin: ps.nom_latin,
              diametre_m: ps.diametre_m,
              hauteur_m: ps.hauteur_m,
              version: ps.version,
              rotation: 0,
            },
            ordre: etat.elements.size,
          };
          dispatch({ type: "CREER_ELEMENT", element });
          // L'outil reste actif pour poser d'autres plantes
          break;
        }

        case "mesurer":
          dispatch({ type: "AJOUTER_POINT", point: pt });
          break;

        case "zone_rectangle":
          if (etat.traceEnCours.length === 0) {
            dispatch({ type: "AJOUTER_POINT", point: pt });
          } else {
            const p1z = etat.traceEnCours[0];
            const nz = zonesCount(etat.elements);
            const zoneEl: Element = {
              id: genererIdLocal(),
              type: "zone",
              geometrie: {
                type: "rectangle",
                points: [p1z, [pt[0], p1z[1]], pt, [p1z[0], pt[1]]],
              },
              calque: "zones",
              statut: "nouveau",
              hauteur: null,
              proprietes: { nom: `Zone ${nz + 1}`, ordre: nz },
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element: zoneEl });
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "zone_polygone":
          if (
            etat.traceEnCours.length >= 3 &&
            distPt(pt, etat.traceEnCours[0]) < 1
          ) {
            const nzp = zonesCount(etat.elements);
            const zoneElP: Element = {
              id: genererIdLocal(),
              type: "zone",
              geometrie: { type: "polygone", points: [...etat.traceEnCours] },
              calque: "zones",
              statut: "nouveau",
              hauteur: null,
              proprietes: { nom: `Zone ${nzp + 1}`, ordre: nzp },
              ordre: etat.elements.size,
            };
            dispatch({ type: "CREER_ELEMENT", element: zoneElP });
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
            break;
          }
          dispatch({ type: "AJOUTER_POINT", point: pt });
          break;

        default:
          break;
      }
    },
    [etat.outil, etat.traceEnCours, etat.calqueActif, etat.elements, etat.selection, editBase, editAxeA],
  );

  // (poignées gérées directement dans onClicCanevas / onMouseUp)

  // Clic droit → terminer le tracé
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (etat.traceEnCours.length >= 2) {
        creerElement("polyligne", [...etat.traceEnCours]);
      }
    },
    [etat.traceEnCours, creerElement],
  );

  // Pointer up — fin de glissement, drag, rectangle de sélection, ou clic
  const onPointerUpHandler = useCallback(
    (pt: Pt, altKey: boolean) => {

      const finalPt = curseurRef.current;

      // 1. Fin de glissement de poignée
      if (poigneeActive) {
        const el = etat.elements.get(poigneeActive.elementId);
        if (el) {
          if (el.type === "vegetal" && poigneeActive.type === "rayon" && el.geometrie.type === "point") {
            const nouvDiam = calculerNouveauDiametre(el.geometrie.position, finalPt);
            dispatch({
              type: "MODIFIER_ELEMENTS",
              elements: [{ ...el, proprietes: { ...el.proprietes, diametre_m: nouvDiam } }],
            });
          } else {
            const nouvelleGeom = appliquerDeplacementPoignee(el.geometrie, poigneeActive, finalPt);
            if (nouvelleGeom) {
              dispatch({ type: "MODIFIER_ELEMENTS", elements: [{ ...el, geometrie: nouvelleGeom }] });
            }
          }
        }
        setPoigneeActive(null);
        poigneePreviewRef.current = null;
        return;
      }

      // 2. Fin de drag d'objets
      if (dragActiveRef.current && dragIdsRef.current && dragDeltaRef.current) {
        const delta = dragDeltaRef.current;
        const ids = dragIdsRef.current;
        if (Math.abs(delta[0]) > 0.001 || Math.abs(delta[1]) > 0.001) {
          const modifies = Array.from(ids)
            .map((sid) => etat.elements.get(sid))
            .filter(Boolean) as Element[];

          if (altKey) {
            // Copie : créer des copies aux nouvelles positions
            modifies.forEach((el) => {
              dispatch({
                type: "CREER_ELEMENT",
                element: {
                  ...el,
                  id: genererIdLocal(),
                  geometrie: deplacerGeometrie(el.geometrie, delta[0], delta[1]),
                },
              });
            });
          } else {
            // Déplacement
            dispatch({
              type: "MODIFIER_ELEMENTS",
              elements: modifies.map((el) => ({
                ...el,
                geometrie: deplacerGeometrie(el.geometrie, delta[0], delta[1]),
              })),
            });
          }
        }
        dragActiveRef.current = false;
        dragIdsRef.current = null;
        dragBaseRef.current = null;
        dragDeltaRef.current = null;
        pointerDownPtRef.current = null;
        return;
      }

      // 3. Fin de rectangle de sélection
      if (rectDebut && etat.outil === "selection") {
        if (Math.abs(pt[0] - rectDebut[0]) > 0.5 || Math.abs(pt[1] - rectDebut[1]) > 0.5) {
          const elements = Array.from(etat.elements.values())
            .filter((el) => elementSelectionnableAEtape(el.type, etat.etape));
          const ids = selectionParRectangle(rectDebut, pt, elements, etat.calques);
          if (ids.length > 0) {
            dispatch({ type: "SELECTIONNER", ids, ajouter: shiftKeyRef.current });
          }
        }
        setRectDebut(null);
        pointerDownPtRef.current = null;
        return;
      }

      // 4. Clic simple (pointerdown sans drag)
      if (pointerDownPtRef.current) {
        onClicCanevas(finalPt);
        pointerDownPtRef.current = null;
        pointerDownElementRef.current = null;
      }
    },
    [rectDebut, etat.outil, etat.elements, etat.calques, etat.etape, poigneeActive, onClicCanevas],
  );

  // Saisie Entrée/Espace
  const onEntreeSaisie = useCallback(
    (texte: string) => {
      const s = texte.trim().toUpperCase();

      // Commande ?
      if (COMMANDES[s]) {
        const outil = COMMANDES[s];
        // Vérifier si l'outil est disponible à l'étape en cours
        if (!outilDisponibleAEtape(outil, etat.etape)) {
          const etapeOutil = etapePourOutil(outil);
          const msg = etapeOutil
            ? `Commande disponible à l'étape ${etapeOutil} (${ETAPES_LABELS[etapeOutil]})`
            : "Commande non disponible";
          dispatch({ type: "CHANGER_OUTIL", outil: "selection", message: msg });
          return;
        }
        dispatch({ type: "CHANGER_OUTIL", outil });
        // Outils d'édition → démarrer en phase sélection
        if (["deplacer", "copier", "rotation", "miroir"].includes(outil)) {
          if (etat.selection.size > 0) {
            setPhaseEdition("base");
            dispatch({ type: "CHANGER_OUTIL", outil, message: "Point de base" });
          } else {
            setPhaseEdition("selection");
            dispatch({ type: "CHANGER_OUTIL", outil, message: "Sélectionnez les objets, puis Entrée" });
          }
        }
        return;
      }

      // Phase d'édition : Entrée valide la sélection → passer à base
      if (
        ["deplacer", "copier", "rotation", "miroir"].includes(etat.outil) &&
        phaseEdition === "selection" &&
        texte.trim() === ""
      ) {
        if (etat.selection.size > 0) {
          setPhaseEdition("base");
          dispatch({ type: "CHANGER_OUTIL", outil: etat.outil, message: "Point de base" });
        }
        return;
      }

      // Phase destination : saisie de distance (M, CO) ou angle (RO)
      if (phaseEdition === "destination" && editBase) {
        if (etat.outil === "rotation") {
          const angle = parseFloat(texte);
          if (!isNaN(angle)) {
            const modifies = Array.from(etat.selection)
              .map((sid) => etat.elements.get(sid))
              .filter(Boolean) as Element[];
            dispatch({
              type: "MODIFIER_ELEMENTS",
              elements: modifies.map((el) => ({
                ...el,
                geometrie: rotationGeometrie(el.geometrie, editBase, angle),
              })),
            });
            setEditBase(null);
            setPhaseEdition("selection");
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
            return;
          }
        }
        if (etat.outil === "deplacer" || etat.outil === "copier") {
          const result = parseSaisie(texte, editBase, curseurRef.current);
          if (result?.type === "longueur") {
            const dx = result.point[0] - editBase[0];
            const dy = result.point[1] - editBase[1];
            const modifies = Array.from(etat.selection)
              .map((sid) => etat.elements.get(sid))
              .filter(Boolean) as Element[];
            if (etat.outil === "deplacer") {
              dispatch({
                type: "MODIFIER_ELEMENTS",
                elements: modifies.map((el) => ({
                  ...el,
                  geometrie: deplacerGeometrie(el.geometrie, dx, dy),
                })),
              });
              setEditBase(null);
              setPhaseEdition("selection");
              dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
            } else {
              modifies.forEach((el) => {
                dispatch({
                  type: "CREER_ELEMENT",
                  element: {
                    ...el,
                    id: genererIdLocal(),
                    geometrie: copierGeometrie(el.geometrie, dx, dy),
                  },
                });
              });
            }
            return;
          }
        }
      }

      // Pendant un tracé : longueur ou fermeture
      if (etat.traceEnCours.length > 0) {
        const base = etat.traceEnCours[etat.traceEnCours.length - 1];
        const result = parseSaisie(texte, base, curseurRef.current);

        if (result?.type === "fermer" && etat.traceEnCours.length >= 3) {
          // Fermer en polygone
          const element: Element = {
            id: genererIdLocal(),
            type: "sol",
            geometrie: { type: "polygone", points: [...etat.traceEnCours] },
            calque: etat.calqueActif,
            statut: "nouveau",
            hauteur: null,
            proprietes: {},
            ordre: etat.elements.size,
          };
          dispatch({ type: "CREER_ELEMENT", element });
          dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          return;
        }

        if (result?.type === "longueur") {
          dispatch({ type: "AJOUTER_POINT", point: result.point });
          return;
        }
      }

      // Entrée sans saisie pendant un tracé → terminer
      if (texte.trim() === "" && etat.traceEnCours.length >= 2) {
        // Zone polygone → créer une zone
        if (etat.outil === "zone_polygone" && etat.traceEnCours.length >= 3) {
          const nze = zonesCount(etat.elements);
          const zoneEl: Element = {
            id: genererIdLocal(),
            type: "zone",
            geometrie: { type: "polygone", points: [...etat.traceEnCours] },
            calque: "zones",
            statut: "nouveau",
            hauteur: null,
            proprietes: { nom: `Zone ${nze + 1}`, ordre: nze },
            ordre: etat.elements.size,
          };
          dispatch({ type: "CREER_ELEMENT", element: zoneEl });
          dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          return;
        }

        const geomType = etat.outil === "polygone" ? "polygone" : "polyligne";
        const element: Element = {
          id: genererIdLocal(),
          type: geomType === "polygone" ? "sol" : "limite",
          geometrie: { type: geomType, points: [...etat.traceEnCours] },
          calque: etat.calqueActif,
          statut: "nouveau",
          hauteur: null,
          proprietes: {},
          ordre: etat.elements.size,
        };
        dispatch({ type: "CREER_ELEMENT", element });
        dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
      }
    },
    [etat.traceEnCours, etat.outil, etat.calqueActif, etat.elements, etat.selection, phaseEdition, editBase],
  );

  // Raccourcis clavier globaux — toutes les frappes passent par ici
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ne pas intercepter si on est dans un vrai champ texte (formulaire, panneau)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Touches spéciales directes
      if (e.key === "Escape") {
        dispatch({ type: "ANNULER_TRACE" });
        setSommetSelectionne(null);
        setPoigneeActive(null);
        setEditBase(null);
        setEditAxeA(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (sommetSelectionne) {
          const el = etat.elements.get(sommetSelectionne.elementId);
          if (el) {
            const result = supprimerSommet(el.geometrie, sommetSelectionne.index);
            if (result) {
              dispatch({ type: "MODIFIER_ELEMENTS", elements: [{ ...el, geometrie: result }] });
              setSommetSelectionne(null);
            }
          }
        } else {
          dispatch({ type: "SUPPRIMER_SELECTION" });
        }
        return;
      }
      if (e.key === "F3") { e.preventDefault(); dispatch({ type: "TOGGLE_ACCROCHAGE" }); return; }
      if (e.key === "F8") { e.preventDefault(); dispatch({ type: "TOGGLE_ORTHO" }); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); dispatch({ type: "ANNULER" }); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault(); dispatch({ type: "RETABLIR" }); return;
      }
      // Ignorer les autres raccourcis système
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Entrée ou Espace → valider la saisie (lire depuis la ref, pas la closure)
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onEntreeSaisie(saisieRef.current);
        dispatch({ type: "SAISIE", texte: "" });
        return;
      }

      // Backspace dans la saisie
      if (e.key === "Backspace") {
        dispatch({ type: "SAISIE", texte: saisieRef.current.slice(0, -1) });
        return;
      }

      // Caractères imprimables → barre de saisie
      if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "SAISIE", texte: saisieRef.current + e.key });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [etat.saisie, etat.elements, sommetSelectionne, onEntreeSaisie]);

  // Sélection comme tableau d'éléments pour PanneauInfos
  const selectionElements = Array.from(etat.selection)
    .map((id) => etat.elements.get(id))
    .filter(Boolean) as Element[];

  // Surface parcelle
  let surfaceParcelle: number | null = null;
  if (projet?.parcelles_geojson) {
    surfaceParcelle = calculerSurface(projet.parcelles_geojson);
  }

  // Indicateurs pour BarreEtapes
  const aZones = Array.from(etat.elements.values()).some((el) => el.type === "zone");
  const aVegetaux = Array.from(etat.elements.values()).some((el) => el.type === "vegetal");

  // Cadrage sur une zone (marge 10 %)
  const cadrerSurZone = useCallback(
    (points: Pt[]) => {
      if (points.length === 0) return;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const [x, y] of points) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
      const largeur = xMax - xMin;
      const hauteur = yMax - yMin;
      const marge = Math.max(largeur, hauteur) * 0.1 + 5;
      const container = document.querySelector("[data-testid='canevas-container']");
      const cw = container?.clientWidth ?? 800;
      const ch = container?.clientHeight ?? 600;
      const scaleX = cw / (largeur + marge * 2);
      const scaleY = ch / (hauteur + marge * 2);
      const scale = Math.min(scaleX, scaleY);
      const centreX = (xMin + xMax) / 2;
      const centreY = (yMin + yMax) / 2;
      // terrainVersEcran juste flip Y
      const ecX = centreX;
      const ecY = -centreY;
      zoomRef.current = scale;
      // Force re-render via dispatch (pas d'état local pour zoom/position dans PageProjetClient)
      // On utilise un événement custom que CanevasEditeur écoute
      window.dispatchEvent(new CustomEvent("cadrer-zone", {
        detail: { zoom: scale, x: cw / 2 - ecX * scale, y: ch / 2 - ecY * scale },
      }));
    },
    [],
  );

  // "Tout le jardin" — crée une zone à l'emprise de la parcelle
  const toutLeJardin = useCallback(async () => {
    if (!projet?.parcelles_geojson) return;
    const geojson = projet.parcelles_geojson;
    let points: Pt[];

    if (geojson.type === "MultiPolygon") {
      // Union via polygon-clipping (import dynamique)
      const pc = (await import("polygon-clipping")).default;
      const polys = geojson.coordinates as unknown as import("polygon-clipping").Polygon[];
      const result = pc.union(polys[0], ...polys.slice(1));
      points = (result[0]?.[0] ?? []).map(([x, y]) => [x, y] as Pt);
    } else {
      points = (geojson.coordinates[0] ?? []).map(([x, y]) => [x, y] as Pt);
    }

    // Supprimer le dernier point s'il est identique au premier (GeoJSON fermé)
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        points = points.slice(0, -1);
      }
    }

    if (points.length < 3) return;

    const zoneEl: Element = {
      id: genererIdLocal(),
      type: "zone",
      geometrie: { type: "polygone", points },
      calque: "zones",
      statut: "nouveau",
      hauteur: null,
      proprietes: { nom: "Tout le jardin", ordre: zonesCount(etat.elements) },
      ordre: etat.elements.size,
    };
    dispatch({ type: "CREER_ELEMENT", element: zoneEl });
  }, [projet, etat.elements]);

  if (chargement) {
    return <div className="w-full h-screen bg-paper-2 animate-pulse" />;
  }

  if (erreur || !projet) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <div className="text-center">
          <p className="text-red-700">{erreur ?? "Projet introuvable."}</p>
          <Link href="/conception" className="mt-4 text-brass hover:text-brass-soft">
            &larr; Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-paper">
      <header className="border-b border-hair-light px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/conception" className="text-brass hover:text-brass-soft text-[0.82rem]">
            &larr;
          </Link>
          <span className="font-serif font-medium text-[1.1rem] text-green-950">
            {projet.nom}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {process.env.NODE_ENV === "development" && (
            <>
              <button
                onClick={() => {
                  const els: Element[] = [];
                  for (let i = 0; i < 500; i++) {
                    const x = Math.random() * 80 - 10;
                    const y = Math.random() * 80 - 10;
                    const types = ["polyligne", "polygone", "cercle"] as const;
                    const t = types[i % 3];
                    let geom: Geometrie;
                    if (t === "cercle") {
                      geom = { type: "cercle", centre: [x, y] as Pt, rayon: 0.5 + Math.random() * 2 };
                    } else if (t === "polygone") {
                      const s = 1 + Math.random() * 3;
                      geom = { type: "polygone", points: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]] };
                    } else {
                      geom = { type: "polyligne", points: [[x, y], [x + Math.random() * 4, y + Math.random() * 4]] };
                    }
                    els.push({
                      id: genererIdLocal(),
                      type: "sol",
                      geometrie: geom,
                      calque: "test",
                      statut: "nouveau",
                      hauteur: null,
                      proprietes: {},
                      ordre: i,
                    });
                  }
                  els.forEach((el) => dispatch({ type: "CREER_ELEMENT", element: el }));
                }}
                className="text-[0.72rem] text-stone hover:text-brass"
              >
                +500 test
              </button>
              <button
                onClick={() => {
                  const ids = Array.from(etat.elements.values())
                    .filter((e) => e.calque === "test")
                    .map((e) => e.id);
                  dispatch({ type: "SELECTIONNER", ids });
                  dispatch({ type: "SUPPRIMER_SELECTION" });
                }}
                className="text-[0.72rem] text-stone hover:text-brass"
              >
                Suppr test
              </button>
            </>
          )}
          <form action="/api/auth/deconnexion" method="POST">
            <button type="submit" className="text-[0.78rem] text-stone hover:text-brass">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <BarreEtapes
        etape={etat.etape}
        aZones={aZones}
        aVegetaux={aVegetaux}
        dispatch={dispatch}
      />
      <div className="flex-1 relative overflow-hidden" data-testid="canevas-container">
        <CanevasEditeur
          parcelles={projet.parcelles_geojson}
          batiments={projet.batiments_geojson ?? []}
          orthoUrl={projet.ortho_url}
          orthoEmprise={projet.ortho_emprise}
          opaciteOrtho={etat.opaciteOrtho}
          elements={etat.elements}
          selection={etat.selection}
          calques={etat.calques}
          traceEnCours={etat.traceEnCours}
          outil={etat.outil}
          curseurRef={curseurRef}
          accrochageRef={accrochageRef}
          zoomRef={zoomRef}
          rectDebut={rectDebut}
          onPointerMove={onPointerMoveHandler}
          onPointerDown={onPointerDownHandler}
          onPointerUp={onPointerUpHandler}
          onContextMenu={onContextMenu}
          dragIdsRef={dragIdsRef}
          dragDeltaRef={dragDeltaRef}
          dragAltRef={dragAltRef}
          survoleRef={survoleRef}
          poigneeSurvoleRef={poigneeSurvoleRef}
          poigneePreviewRef={poigneePreviewRef}
          poigneeActive={poigneeActive}
          etape={etat.etape}
          zoneActive={etat.zoneActive}
          planteSelectionnee={etat.planteSelectionnee}
        />

        <BarreOutils
          outil={etat.outil}
          accrochage={etat.accrochageActif}
          ortho={etat.modeOrtho}
          etape={etat.etape}
          dispatch={dispatch}
        />

        {etat.etape === 3 && (
          <PanneauCalques
            calques={etat.calques}
            calqueActif={etat.calqueActif}
            opaciteOrtho={etat.opaciteOrtho}
            dispatch={dispatch}
          />
        )}

        <PanneauInfos selection={selectionElements} />

        {etat.etape === 2 && (
          <PanneauZones
            elements={etat.elements}
            zoneActive={etat.zoneActive}
            dispatch={dispatch}
            onCadrerZone={cadrerSurZone}
            onToutLeJardin={toutLeJardin}
          />
        )}

        {etat.etape === 4 && (
          <>
            <PanneauVegetaux
              dispatch={dispatch}
              planteActive={etat.planteSelectionnee}
            />
            <PanneauListeVegetaux
              elements={etat.elements}
              dispatch={dispatch}
            />
          </>
        )}

        {surfaceParcelle != null && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/90 px-3 py-1.5 rounded text-[0.82rem] text-ink border border-hair-light">
            Parcelle : {surfaceParcelle.toLocaleString("fr-FR")} m²
          </div>
        )}

        <BarreSaisie
          saisie={etat.saisie}
          message={etat.messageCommande}
          sauvegarde={sauvegarde}
        />
        <span data-testid="element-count" className="hidden">{etat.elements.size}</span>

      </div>
    </div>
  );
}

// ===================== Utilitaires =====================

function calculerSurface(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const rings =
    geom.type === "MultiPolygon"
      ? geom.coordinates.map((p) => p[0])
      : [geom.coordinates[0]];
  let total = 0;
  for (const ring of rings) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    total += Math.abs(area) / 2;
  }
  return Math.round(total);
}

function zonesCount(elements: Map<string, Element>): number {
  let n = 0;
  for (const el of elements.values()) {
    if (el.type === "zone") n++;
  }
  return n;
}

// hitTest supprimé — remplacé par hitTestGeometrique dans selection.ts

function calculerArcDepuis3Points(p1: Pt, p2: Pt, p3: Pt): Geometrie | null {
  // Circumcenter of 3 points
  const ax = p1[0], ay = p1[1];
  const bx = p2[0], by = p2[1];
  const cx = p3[0], cy = p3[1];

  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) return null;

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;

  const rayon = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);
  const angleDebut = (Math.atan2(ay - uy, ax - ux) * 180) / Math.PI;
  const angleFin = (Math.atan2(cy - uy, cx - ux) * 180) / Math.PI;

  return {
    type: "arc",
    centre: [ux, uy],
    rayon,
    angleDebut: (angleDebut + 360) % 360,
    angleFin: (angleFin + 360) % 360,
  };
}

