/**
 * Grille de repères commune au plan et aux photos — fonctions pures.
 *
 * Posée sur l'emprise du massif plus MARGE_GRILLE m autour, orientée nord en haut,
 * au pas de 1 m (2 m si le massif dépasse 15 m). Colonnes en lettres d'ouest en est
 * (A, B… Z, AA…), lignes en chiffres du nord au sud (1, 2…). Une case : « C4 ».
 */

import type { Pt } from "../geo/plan";

export const MARGE_GRILLE = 3;
export const SEUIL_PAS_LARGE = 15;

export interface Grille {
  /** Coin nord-ouest (x minimal, y maximal), en mètres plan. */
  xMin: number;
  yMax: number;
  pas: number;
  colonnes: number;
  lignes: number;
}

export interface RectPlan {
  x0: number; y0: number; x1: number; y1: number;
}

export function grilleMassif(contour: Pt[]): Grille {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [x, y] of contour) {
    xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
  }
  const pas = Math.max(xMax - xMin, yMax - yMin) > SEUIL_PAS_LARGE ? 2 : 1;
  const gxMin = Math.floor((xMin - MARGE_GRILLE) / pas) * pas;
  const gxMax = Math.ceil((xMax + MARGE_GRILLE) / pas) * pas;
  const gyMin = Math.floor((yMin - MARGE_GRILLE) / pas) * pas;
  const gyMax = Math.ceil((yMax + MARGE_GRILLE) / pas) * pas;
  return {
    xMin: gxMin,
    yMax: gyMax,
    pas,
    colonnes: Math.round((gxMax - gxMin) / pas),
    lignes: Math.round((gyMax - gyMin) / pas),
  };
}

/** Nom de colonne : 0 → A, 25 → Z, 26 → AA. */
export function nomColonne(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function indiceColonne(nom: string): number {
  let n = 0;
  for (const c of nom.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function etiquette(colonne: number, ligne: number): string {
  return `${nomColonne(colonne)}${ligne + 1}`;
}

/** Case « C4 » → indices, ou null si mal formée ou hors grille. */
export function lireCase(g: Grille, texte: string): { colonne: number; ligne: number } | null {
  const m = /^\s*([A-Za-z]{1,2})\s*(\d{1,3})\s*$/.exec(texte);
  if (!m) return null;
  const colonne = indiceColonne(m[1]);
  const ligne = Number(m[2]) - 1;
  if (colonne < 0 || colonne >= g.colonnes || ligne < 0 || ligne >= g.lignes) return null;
  return { colonne, ligne };
}

/** Carré couvert par une case, en mètres plan. */
export function rectCase(g: Grille, colonne: number, ligne: number): RectPlan {
  const x0 = g.xMin + colonne * g.pas;
  const y1 = g.yMax - ligne * g.pas;
  return { x0, y0: y1 - g.pas, x1: x0 + g.pas, y1 };
}

export function centreCase(g: Grille, colonne: number, ligne: number): Pt {
  const r = rectCase(g, colonne, ligne);
  return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
}

/** Case contenant un point du plan, ou null hors grille. */
export function caseDuPoint(g: Grille, p: Pt): string | null {
  const colonne = Math.floor((p[0] - g.xMin) / g.pas);
  const ligne = Math.floor((g.yMax - p[1]) / g.pas);
  if (colonne < 0 || colonne >= g.colonnes || ligne < 0 || ligne >= g.lignes) return null;
  return etiquette(colonne, ligne);
}

/** Segments des lignes de la grille (verticales puis horizontales), en mètres plan. */
export function traitsGrille(g: Grille): [Pt, Pt][] {
  const traits: [Pt, Pt][] = [];
  const yMin = g.yMax - g.lignes * g.pas;
  const xMax = g.xMin + g.colonnes * g.pas;
  for (let c = 0; c <= g.colonnes; c++) {
    const x = g.xMin + c * g.pas;
    traits.push([[x, g.yMax], [x, yMin]]);
  }
  for (let l = 0; l <= g.lignes; l++) {
    const y = g.yMax - l * g.pas;
    traits.push([[g.xMin, y], [xMax, y]]);
  }
  return traits;
}

/** Toutes les cases, avec leur centre. */
export function toutesLesCases(g: Grille): { texte: string; colonne: number; ligne: number; centre: Pt }[] {
  const out = [];
  for (let l = 0; l < g.lignes; l++) {
    for (let c = 0; c < g.colonnes; c++) out.push({ texte: etiquette(c, l), colonne: c, ligne: l, centre: centreCase(g, c, l) });
  }
  return out;
}

/** Description de la grille pour la consigne de l'IA. */
export function decrireGrille(g: Grille): string {
  return `Grille de ${g.colonnes} colonnes (${nomColonne(0)} à ${nomColonne(g.colonnes - 1)}, d'ouest en est) et ${g.lignes} lignes (1 à ${g.lignes}, du nord au sud), cases de ${g.pas} m de côté.`;
}
