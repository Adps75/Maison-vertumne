/**
 * Zones d'exclusion du placement, issues de l'existant validé — fonctions pures.
 * Chaque élément conservé occupe des cases de la grille ; aucune plante de la
 * composition ne peut avoir son pied à moins de son rayon d'écartement de ces cases.
 */

import type { Pt } from "../geo/plan";
import { lireCase, rectCase, type Grille, type RectPlan } from "./grille";

export interface ZoneExclusion {
  libelle: string;
  rects: RectPlan[];
}

/** Cases valides d'un élément (les cases hors grille ou mal formées sont ignorées). */
export function rectsDesCases(g: Grille, cases: string[]): RectPlan[] {
  const vus = new Set<string>();
  const rects: RectPlan[] = [];
  for (const c of cases) {
    const lu = lireCase(g, c);
    if (!lu) continue;
    const cle = `${lu.colonne}:${lu.ligne}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    rects.push(rectCase(g, lu.colonne, lu.ligne));
  }
  return rects;
}

export function zonesExclusion(g: Grille, existants: { libelle: string; cases: string[] }[]): ZoneExclusion[] {
  return existants
    .map((e) => ({ libelle: e.libelle, rects: rectsDesCases(g, e.cases) }))
    .filter((z) => z.rects.length > 0);
}

/** Distance d'un point à un rectangle (0 à l'intérieur). */
export function distanceRect(p: Pt, r: RectPlan): number {
  const dx = Math.max(r.x0 - p[0], 0, p[0] - r.x1);
  const dy = Math.max(r.y0 - p[1], 0, p[1] - r.y1);
  return Math.hypot(dx, dy);
}

/** Le point est-il trop proche d'une zone d'exclusion (distance < rayon) ? */
export function dansExclusion(p: Pt, rayon: number, rects: RectPlan[]): boolean {
  return rects.some((r) => distanceRect(p, r) < rayon);
}

/** Centre et diamètre d'un élément existant d'après ses cases (pour l'ajouter au plan). */
export function empriseDesCases(rects: RectPlan[]): { centre: Pt; diametre: number } | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x0)), x1 = Math.max(...rects.map((r) => r.x1));
  const y0 = Math.min(...rects.map((r) => r.y0)), y1 = Math.max(...rects.map((r) => r.y1));
  return { centre: [(x0 + x1) / 2, (y0 + y1) / 2], diametre: Math.max(0.5, Math.min(x1 - x0, y1 - y0)) };
}
