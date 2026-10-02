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
import { genererIdLocal } from "@/lib/id-client";
import { ecranVersTerrain } from "@/modules/conception/geo/canevas";
import { trouverAccrochage, contrainteOrtho } from "@/modules/conception/editeur/accrochage";
import type { Element, Geometrie, NomOutil, Accrochage as AccrochageType } from "@/modules/conception/types";
import { deplacerGeometrie, copierGeometrie, rotationGeometrie, miroirGeometrie } from "@/modules/conception/editeur/transformation";
import { dist as distPt, pointDansPolygone } from "@/modules/conception/geo/plan";
import type { Pt } from "@/modules/conception/geo/plan";
import {
  appliquerDeplacementPoignee,
  supprimerSommet,
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

  // Mouvement de la souris — met à jour les refs sans re-render
  const onMouseMove = useCallback(
    (terrainPt: Pt) => {
      let pt = terrainPt;

      // Mode ortho
      if (etat.modeOrtho && etat.traceEnCours.length > 0) {
        pt = contrainteOrtho(etat.traceEnCours[etat.traceEnCours.length - 1], pt);
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
    },
    [etat.accrochageActif, etat.modeOrtho, etat.traceEnCours, etat.elements, parcellePoints, batimentsPoints],
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
          if (etat.traceEnCours.length === 1) {
            const p1 = etat.traceEnCours[0];
            const element: Element = {
              id: genererIdLocal(),
              type: "cote",
              geometrie: { type: "polyligne", points: [p1, pt] },
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
          const elements = Array.from(etat.elements.values());
          const touche = hitTest(pt, elements);
          if (touche) {
            dispatch({ type: "SELECTIONNER", ids: [touche.id], ajouter: shiftKeyRef.current });
          } else {
            dispatch({ type: "DESELECTIONNER" });
            // Début de sélection rectangle
            setRectDebut(pt);
          }
          break;
        }

        case "deplacer":
        case "copier":
          if (etat.selection.size === 0) break;
          if (!editBase) {
            setEditBase(pt);
          } else {
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
            setEditBase(null);
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "rotation":
          if (etat.selection.size === 0) break;
          if (!editBase) {
            setEditBase(pt);
          } else {
            const angle = parseFloat(prompt("Angle de rotation (degrés) :") ?? "");
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
            }
            setEditBase(null);
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "miroir":
          if (etat.selection.size === 0) break;
          if (!editAxeA) {
            setEditAxeA(pt);
          } else {
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
            dispatch({ type: "CHANGER_OUTIL", outil: "selection" });
          }
          break;

        case "mesurer":
          dispatch({ type: "AJOUTER_POINT", point: pt });
          break;

        default:
          break;
      }
    },
    [etat.outil, etat.traceEnCours, etat.calqueActif, etat.elements, etat.selection, editBase, editAxeA],
  );

  // Début de glissement de poignée
  const onPoigneeDebut = useCallback((poignee: Poignee) => {
    setPoigneeActive(poignee);
    setSommetSelectionne({ elementId: poignee.elementId, index: poignee.index });
  }, []);

  // Fin de glissement de poignée
  const onPoigneeFin = useCallback(
    (pt: Pt) => {
      if (!poigneeActive) return;
      const el = etat.elements.get(poigneeActive.elementId);
      if (!el) { setPoigneeActive(null); return; }

      const nouvelleGeom = appliquerDeplacementPoignee(el.geometrie, poigneeActive, pt);
      if (nouvelleGeom) {
        dispatch({
          type: "MODIFIER_ELEMENTS",
          elements: [{ ...el, geometrie: nouvelleGeom }],
        });
      }
      setPoigneeActive(null);
    },
    [poigneeActive, etat.elements],
  );

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

  // Fin de sélection rectangle ou de glissement de poignée (mouseup)
  const onMouseUp = useCallback(
    (pt: Pt) => {
      // Fin de poignée
      if (poigneeActive) {
        onPoigneeFin(curseurRef.current);
        return;
      }

      if (!rectDebut || etat.outil !== "selection") return;
      const xMin = Math.min(rectDebut[0], pt[0]);
      const xMax = Math.max(rectDebut[0], pt[0]);
      const yMin = Math.min(rectDebut[1], pt[1]);
      const yMax = Math.max(rectDebut[1], pt[1]);

      if (Math.abs(xMax - xMin) < 0.5 && Math.abs(yMax - yMin) < 0.5) {
        setRectDebut(null);
        return;
      }

      const rect: Pt[] = [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]];
      const ids: string[] = [];

      for (const el of etat.elements.values()) {
        const geom = el.geometrie;
        let pts: Pt[] = [];
        switch (geom.type) {
          case "polyligne": case "polygone": case "rectangle": pts = geom.points; break;
          case "cercle": pts = [geom.centre]; break;
          case "arc": pts = [geom.centre]; break;
          case "point": pts = [geom.position]; break;
        }
        if (pts.some((p) => p[0] >= xMin && p[0] <= xMax && p[1] >= yMin && p[1] <= yMax)) {
          ids.push(el.id);
        }
      }

      if (ids.length > 0) {
        dispatch({ type: "SELECTIONNER", ids, ajouter: shiftKeyRef.current });
      }
      setRectDebut(null);
    },
    [rectDebut, etat.outil, etat.elements],
  );

  // Saisie Entrée/Espace
  const onEntreeSaisie = useCallback(
    (texte: string) => {
      const s = texte.trim().toUpperCase();

      // Commande ?
      if (COMMANDES[s]) {
        dispatch({ type: "CHANGER_OUTIL", outil: COMMANDES[s] });
        return;
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

      // Entrée sans saisie pendant un tracé → terminer en polyligne
      if (texte.trim() === "" && etat.traceEnCours.length >= 2) {
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
    [etat.traceEnCours, etat.outil, etat.calqueActif, etat.elements],
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

      // Entrée ou Espace → valider la saisie
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onEntreeSaisie(etat.saisie);
        dispatch({ type: "SAISIE", texte: "" });
        return;
      }

      // Backspace dans la saisie
      if (e.key === "Backspace") {
        dispatch({ type: "SAISIE", texte: etat.saisie.slice(0, -1) });
        return;
      }

      // Caractères imprimables → barre de saisie
      if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "SAISIE", texte: etat.saisie + e.key });
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
      <div className="flex-1 relative">
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
          onClicCanevas={onClicCanevas}
          onMouseMove={onMouseMove}
          onContextMenu={onContextMenu}
          onMouseUp={onMouseUp}
          poigneeActive={poigneeActive}
          onPoigneeDebut={onPoigneeDebut}
          onPoigneeFin={onPoigneeFin}
        />

        <BarreOutils
          outil={etat.outil}
          accrochage={etat.accrochageActif}
          ortho={etat.modeOrtho}
          dispatch={dispatch}
        />

        <PanneauCalques
          calques={etat.calques}
          calqueActif={etat.calqueActif}
          opaciteOrtho={etat.opaciteOrtho}
          dispatch={dispatch}
        />

        <PanneauInfos selection={selectionElements} />

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

function hitTest(pt: Pt, elements: Element[]): Element | null {
  let best: Element | null = null;
  let bestDist = 2;

  for (const el of elements) {
    const geom = el.geometrie;
    let points: Pt[] = [];

    switch (geom.type) {
      case "polyligne":
      case "polygone":
      case "rectangle":
        points = geom.points;
        break;
      case "cercle":
        points = [geom.centre];
        break;
      case "arc":
        points = [geom.centre];
        break;
      case "point":
        points = [geom.position];
        break;
    }

    for (const p of points) {
      const d = Math.sqrt((p[0] - pt[0]) ** 2 + (p[1] - pt[1]) ** 2);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
  }

  return best;
}

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
