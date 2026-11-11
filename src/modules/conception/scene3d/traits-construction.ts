/**
 * Traits de construction — fonctions pures, sans dépendance à Three.js.
 *
 * Les éléments dessinés sur le plan (polylignes, polygones, rectangles, cercles,
 * arcs des calques de dessin, plus la zone active) sont reportés dans les vues
 * photo (calage, Visuel), posés sur le relief.
 */

import type { Pt } from "../geo/plan";
import type { Calque, Element } from "../types";
import { planVers3D } from "./conversion";

/** Clé pseudo-calque de la zone active dans le choix des calques affichés. */
export const CLE_ZONE_ACTIVE = "__zone_active__";

/** Calques système exclus des traits (la zone active est traitée à part). */
const CALQUES_EXCLUS = new Set(["topographie", "zones"]);

/** Hauteur des traits au-dessus du terrain, en mètres. */
export const HAUTEUR_TRAITS = 0.02;
/** Pas de découpage des segments pour suivre le relief, en mètres. */
export const PAS_DRAPAGE = 0.25;
/** Pas angulaire maximal pour les cercles et arcs, en degrés. */
const PAS_ANGLE_DEG = 5;

export interface TraitPlan {
  id: string;
  /** Nom du calque, ou CLE_ZONE_ACTIVE pour la zone active. */
  calque: string;
  couleur: string;
  /** Points en coordonnées plan. */
  points: Pt[];
  /** Trait fermé (le dernier point rejoint le premier). */
  ferme: boolean;
}

/** Calques proposés dans le choix « Traits de construction ». */
export function calquesDeDessin(calques: Calque[]): Calque[] {
  return calques.filter((c) => !CALQUES_EXCLUS.has(c.nom));
}

/** Sélection par défaut : calques de dessin visibles dans l'éditeur + zone active. */
export function selectionParDefaut(calques: Calque[]): Set<string> {
  const s = new Set(calquesDeDessin(calques).filter((c) => c.visible).map((c) => c.nom));
  s.add(CLE_ZONE_ACTIVE);
  return s;
}

/** Convertit une géométrie en ligne brisée plane, ou null si elle n'est pas tracée. */
export function geometrieEnLigne(el: Element): { points: Pt[]; ferme: boolean } | null {
  const g = el.geometrie;
  switch (g.type) {
    case "polyligne":
      return g.points.length >= 2 ? { points: g.points, ferme: false } : null;
    case "polygone":
    case "rectangle":
      return g.points.length >= 3 ? { points: g.points, ferme: true } : null;
    case "cercle": {
      if (!(g.rayon > 0)) return null;
      const n = Math.ceil(360 / PAS_ANGLE_DEG);
      const points: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        points.push([g.centre[0] + g.rayon * Math.cos(a), g.centre[1] + g.rayon * Math.sin(a)]);
      }
      return { points, ferme: true };
    }
    case "arc": {
      if (!(g.rayon > 0)) return null;
      let balayage = g.angleFin - g.angleDebut;
      while (balayage <= 0) balayage += 360; // sens trigo
      const n = Math.max(1, Math.ceil(balayage / PAS_ANGLE_DEG));
      const points: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const a = ((g.angleDebut + (balayage * i) / n) * Math.PI) / 180;
        points.push([g.centre[0] + g.rayon * Math.cos(a), g.centre[1] + g.rayon * Math.sin(a)]);
      }
      return { points, ferme: false };
    }
    default:
      return null;
  }
}

/**
 * Sélectionne les traits à afficher.
 *
 * @param elements éléments du projet
 * @param calques calques du projet (pour les couleurs)
 * @param zoneActiveId id de la zone active (null = aucune)
 * @param calquesAffiches calques cochés (CLE_ZONE_ACTIVE pour la zone active)
 */
export function selectionnerTraits(
  elements: Iterable<Element>,
  calques: Calque[],
  zoneActiveId: string | null,
  calquesAffiches: Set<string>,
): TraitPlan[] {
  const couleurs = new Map(calques.map((c) => [c.nom, c.couleur]));
  const traits: TraitPlan[] = [];

  for (const el of elements) {
    if (el.statut === "supprime") continue;

    let cle: string;
    if (el.type === "zone") {
      if (el.id !== zoneActiveId) continue;
      cle = CLE_ZONE_ACTIVE;
    } else {
      if (el.type === "vegetal" || el.type === "cote" || el.type === "point_cote") continue;
      if (CALQUES_EXCLUS.has(el.calque)) continue;
      cle = el.calque;
    }
    if (!calquesAffiches.has(cle)) continue;

    const ligne = geometrieEnLigne(el);
    if (!ligne) continue;

    const couleur = el.type === "zone"
      ? couleurs.get("zones") ?? "#9C7C3C"
      : couleurs.get(el.calque) ?? "#888888";
    traits.push({ id: el.id, calque: cle, couleur, ...ligne });
  }
  return traits;
}

/**
 * Pose une ligne plane sur le relief : chaque segment est découpé tous les
 * `pas` mètres et chaque point est placé à altitudeEn + hauteur.
 *
 * @returns points en coordonnées Three.js [x, y, z]
 */
export function draperLigne(
  points: Pt[],
  ferme: boolean,
  altitudeEn: (x: number, y: number) => number,
  hauteur = HAUTEUR_TRAITS,
  pas = PAS_DRAPAGE,
): [number, number, number][] {
  if (points.length === 0) return [];
  const sommets = ferme ? [...points, points[0]] : points;
  const sortie: [number, number, number][] = [];
  const poser = (x: number, y: number) => sortie.push(planVers3D(x, y, altitudeEn(x, y) + hauteur));

  poser(sommets[0][0], sommets[0][1]);
  for (let i = 1; i < sommets.length; i++) {
    const [ax, ay] = sommets[i - 1];
    const [bx, by] = sommets[i];
    const longueur = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(longueur / pas));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      poser(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return sortie;
}
