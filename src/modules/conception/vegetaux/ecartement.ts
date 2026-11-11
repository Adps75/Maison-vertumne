/**
 * Écartement entre végétaux — fonctions pures.
 *
 * Règles de strates :
 * - arbre (ou forme "tige") vs arbre : rayon de couronne complet
 * - arbre vs autre strate : rayon de pied fixe (0,30 m)
 * - arbuste / vivace / graminée entre eux : rayon complet
 * - couvre_sol / grimpante : aucun conflit
 */

import { dist, type Pt } from "../geo/plan";
import type { Element } from "../types";

export interface VoisineInfo {
  id: string;
  position: [number, number];
  rayon: number; // diametre_m / 2
  categorie: string;
  forme: string | null;
  nom?: string;
}

export interface Conflit {
  idA: string;
  idB: string;
  nomA: string;
  nomB: string;
  distance: number;
  distanceMin: number;
}

const RAYON_PIED_ARBRE = 0.30;
const STRATES_SANS_CONFLIT = new Set(["couvre_sol", "grimpante"]);

/** Détermine si une plante est un arbre (catégorie "arbre" ou forme "tige"). */
function estArbre(v: VoisineInfo): boolean {
  return v.categorie === "arbre" || v.forme === "tige";
}

/**
 * Rayon effectif d'une plante vis-à-vis d'une autre, selon les strates.
 */
export function rayonEffectif(plante: VoisineInfo, visAVis: VoisineInfo): number {
  if (STRATES_SANS_CONFLIT.has(plante.categorie)) return 0;
  if (STRATES_SANS_CONFLIT.has(visAVis.categorie)) return 0;

  if (estArbre(plante)) {
    // Arbre vs arbre : rayon de couronne
    if (estArbre(visAVis)) return plante.rayon;
    // Arbre vs autre strate : rayon de pied
    return RAYON_PIED_ARBRE;
  }

  // Non-arbre vs arbre : utiliser le rayon de la plante (pas de l'arbre)
  // L'arbre contribue son rayon de pied via rayonEffectif(arbre, plante)
  return plante.rayon;
}

/**
 * Écartement minimal entre deux plantes.
 * = (rayonEffectifA + rayonEffectifB) × (1 - tolérance)
 */
export function ecartementMinimal(a: VoisineInfo, b: VoisineInfo, tolerance: number): number {
  const rA = rayonEffectif(a, b);
  const rB = rayonEffectif(b, a);
  if (rA === 0 && rB === 0) return 0;
  return (rA + rB) * (1 - tolerance);
}

/**
 * Détecte toutes les paires de plantes en conflit.
 */
export function detecterConflits(plantes: VoisineInfo[], tolerance: number): Conflit[] {
  const conflits: Conflit[] = [];
  for (let i = 0; i < plantes.length; i++) {
    for (let j = i + 1; j < plantes.length; j++) {
      const a = plantes[i];
      const b = plantes[j];
      const dMin = ecartementMinimal(a, b, tolerance);
      if (dMin === 0) continue;
      const d = dist(a.position as Pt, b.position as Pt);
      if (d < dMin) {
        conflits.push({
          idA: a.id, idB: b.id,
          nomA: a.nom ?? a.id, nomB: b.nom ?? b.id,
          distance: Math.round(d * 100) / 100,
          distanceMin: Math.round(dMin * 100) / 100,
        });
      }
    }
  }
  return conflits;
}

/**
 * Calcule la position valide la plus proche, en repoussant la plante
 * hors des zones de conflit avec chaque voisine.
 *
 * Algorithme itératif : pour chaque voisine en conflit, repousse la position
 * le long de l'axe entre les deux centres jusqu'à la distance minimale.
 * Si zoneContour est fourni, contraint la position au polygone.
 */
export function positionValideLaPlusProche(
  plante: VoisineInfo,
  positionVoulue: [number, number],
  voisines: VoisineInfo[],
  tolerance: number,
  zoneContour?: [number, number][] | null,
): [number, number] {
  let [x, y] = positionVoulue;

  const MAX_PASSES = 10;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let modifie = false;

    for (const v of voisines) {
      if (v.id === plante.id) continue;
      const dMin = ecartementMinimal({ ...plante, position: [x, y] }, v, tolerance);
      if (dMin === 0) continue;

      const dx = x - v.position[0];
      const dy = y - v.position[1];
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < dMin) {
        if (d < 0.001) {
          // Superposition exacte : repousser vers le nord
          y += dMin;
        } else {
          const ratio = dMin / d;
          x = v.position[0] + dx * ratio;
          y = v.position[1] + dy * ratio;
        }
        modifie = true;
      }
    }

    if (!modifie) break;
  }

  // Contraindre au polygone de la zone
  if (zoneContour && zoneContour.length >= 3) {
    if (!pointDansPolygone(x, y, zoneContour)) {
      [x, y] = pointLePlusProchePolygone(x, y, zoneContour);
    }
  }

  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
}

/**
 * Extrait les VoisineInfo depuis les éléments de type "vegetal".
 */
/**
 * Calcule le rayon d'écartement d'une plante : largeur à 3 ans / 2.
 * Si largeur_3ans_m n'est pas renseigné, utilise 70 % de la largeur adulte.
 */
export function rayonEcartement(props: Record<string, unknown>): number {
  const l3 = props.largeur_3ans_m as number | undefined;
  if (typeof l3 === "number" && l3 > 0) return l3 / 2;
  const adulte = (props.diametre_m as number) ?? 1;
  return (adulte * 0.7) / 2;
}

export function extraireVoisines(elements: Map<string, Element>): VoisineInfo[] {
  const voisines: VoisineInfo[] = [];
  for (const el of elements.values()) {
    if (el.type === "vegetal" && el.geometrie.type === "point") {
      voisines.push({
        id: el.id,
        position: [el.geometrie.position[0], el.geometrie.position[1]],
        rayon: rayonEcartement(el.proprietes),
        categorie: (el.proprietes.categorie as string) ?? "vivace",
        forme: (el.proprietes.forme as string) ?? null,
        nom: (el.proprietes.nom_commun as string) ?? undefined,
      });
    }
  }
  return voisines;
}

// ─── Utilitaires géométriques ──────────────────────────────────────────

/** Test si un point est dans un polygone (ray casting). */
function pointDansPolygone(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point le plus proche d'un polygone (projection sur les segments). */
function pointLePlusProchePolygone(x: number, y: number, poly: [number, number][]): [number, number] {
  let bestDist = Infinity;
  let bestPt: [number, number] = [x, y];

  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const proj = projeterSurSegment(x, y, ax, ay, bx, by);
    const d = Math.sqrt((x - proj[0]) ** 2 + (y - proj[1]) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestPt = proj;
    }
  }
  return bestPt;
}

/** Projection d'un point sur un segment. */
function projeterSurSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): [number, number] {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-10) return [ax, ay];
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * abx, ay + t * aby];
}
