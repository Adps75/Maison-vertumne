/**
 * Zones d'exclusion du placement, issues de l'existant conservé — fonctions pures.
 *
 * Seul l'existant « conserver » exclut : jamais une surface à remplacer (pelouse, sol nu,
 * gravier), ni un élément supprimé. L'exclusion est un cercle à l'emprise réelle de
 * l'élément : celui du plan (position et diamètre, modifiables) quand il y est, sinon
 * celui estimé d'après ses cases.
 */

import type { Pt } from "../geo/plan";
import { lireCase, rectCase, type Grille, type RectPlan } from "./grille";
import type { CercleExclusion } from "./placement";
import { NATURES_SURFACES, type ElementExistant } from "./schemas";

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

/** Centre et diamètre d'un élément existant d'après ses cases (pour l'ajouter au plan). */
export function empriseDesCases(rects: RectPlan[]): { centre: Pt; diametre: number } | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x0)), x1 = Math.max(...rects.map((r) => r.x1));
  const y0 = Math.min(...rects.map((r) => r.y0)), y1 = Math.max(...rects.map((r) => r.y1));
  return { centre: [(x0 + x1) / 2, (y0 + y1) / 2], diametre: Math.max(0.5, Math.min(x1 - x0, y1 - y0)) };
}

/** Référence stable d'un élément de l'analyse (même nature, mêmes cases), portée par l'élément du plan. */
export function referenceExistant(e: Pick<ElementExistant, "nature" | "cases">): string {
  return `${e.nature}:${[...e.cases].map((c) => c.toUpperCase()).sort().join(",")}`;
}

/** Élément existant présent sur le plan (statut « existant »). */
export interface ExistantPlan {
  position: Pt;
  diametre: number;
  /** Référence de l'élément de l'analyse dont il est issu, le cas échéant. */
  reference?: string | null;
  libelle?: string;
}

/**
 * Cercles d'exclusion : chaque existant du plan à son diamètre, plus chaque élément
 * « conserver » de l'analyse absent du plan (cercle estimé d'après ses cases).
 */
export function cerclesExclusion(p: {
  existantsPlan: ExistantPlan[];
  analyse?: { existants: (Pick<ElementExistant, "nature" | "cases" | "recommandation" | "description">)[] } | null;
  grille?: Grille | null;
}): CercleExclusion[] {
  const cercles: CercleExclusion[] = p.existantsPlan.map((e) => ({
    centre: e.position, rayon: Math.max(0.15, e.diametre / 2), libelle: e.libelle,
  }));
  if (!p.analyse || !p.grille) return cercles;
  const surPlan = new Set(p.existantsPlan.map((e) => e.reference).filter(Boolean));
  for (const e of p.analyse.existants) {
    if (e.recommandation !== "conserver" || NATURES_SURFACES.includes(e.nature)) continue;
    if (surPlan.has(referenceExistant(e))) continue;
    const emprise = empriseDesCases(rectsDesCases(p.grille, e.cases));
    if (emprise) cercles.push({ centre: emprise.centre, rayon: emprise.diametre / 2, libelle: e.description });
  }
  return cercles;
}
