/**
 * Projection de la grille de repères et du contour du massif sur une photo calée —
 * fonctions pures (s'appuient sur le projecteur de la caméra calée).
 */

import type { Pt } from "../geo/plan";
import type { Projecteur } from "../camera/projection";
import { toutesLesCases, traitsGrille, type Grille } from "./grille";

/** Hauteur des traits au-dessus du terrain (m). */
const HAUTEUR_TRAITS = 0.02;
/** Pas de découpage des traits pour suivre le relief (m). */
const PAS_DECOUPAGE = 0.25;
/** Marge de tolérance hors image (fraction de l'image) avant de couper un trait. */
const MARGE_IMAGE = 0.25;

export type PointImage = { u: number; v: number };

/** Projette un point au sol (posé sur le relief), ou null derrière la caméra. */
export function projeterSol(p: Pt, projeter: Projecteur, altitudeEn: (x: number, y: number) => number): PointImage | null {
  return projeter(p, altitudeEn(p[0], p[1]) + HAUTEUR_TRAITS);
}

function proche(pt: PointImage): boolean {
  return pt.u > -MARGE_IMAGE && pt.u < 1 + MARGE_IMAGE && pt.v > -MARGE_IMAGE && pt.v < 1 + MARGE_IMAGE;
}

export function dansImage(pt: PointImage): boolean {
  return pt.u >= 0 && pt.u <= 1 && pt.v >= 0 && pt.v <= 1;
}

/**
 * Projette une ligne brisée posée au sol : découpée tous les 25 cm, coupée en
 * tronçons là où elle passe derrière la caméra ou loin hors de l'image.
 */
export function projeterLigne(points: Pt[], ferme: boolean, projeter: Projecteur, altitudeEn: (x: number, y: number) => number): PointImage[][] {
  const sommets = ferme && points.length > 2 ? [...points, points[0]] : points;
  const troncons: PointImage[][] = [];
  let courant: PointImage[] = [];
  const pousser = (p: Pt) => {
    const q = projeterSol(p, projeter, altitudeEn);
    if (q && proche(q)) courant.push(q);
    else if (courant.length > 0) { if (courant.length > 1) troncons.push(courant); courant = []; }
  };
  if (sommets.length > 0) pousser(sommets[0]);
  for (let i = 1; i < sommets.length; i++) {
    const [ax, ay] = sommets[i - 1], [bx, by] = sommets[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / PAS_DECOUPAGE));
    for (let k = 1; k <= n; k++) pousser([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (courant.length > 1) troncons.push(courant);
  return troncons;
}

/** La vue voit-elle le massif ? (au moins un point du contour projeté dans l'image, devant la caméra) */
export function vueVoitMassif(contour: Pt[], projeter: Projecteur, altitudeEn: (x: number, y: number) => number): boolean {
  return projeterLigne(contour, true, projeter, altitudeEn).some((t) => t.some(dansImage));
}

/** Traits de la grille projetés sur la photo. */
export function grilleProjetee(g: Grille, projeter: Projecteur, altitudeEn: (x: number, y: number) => number): PointImage[][] {
  return traitsGrille(g).flatMap(([a, b]) => projeterLigne([a, b], false, projeter, altitudeEn));
}

export interface EtiquetteImage {
  texte: string;
  u: number;
  v: number;
}

/**
 * Étiquettes des cases visibles, au centre projeté de chaque case. Une case trop petite
 * à l'écran (au loin) n'est pas étiquetée ; deux étiquettes ne se chevauchent pas.
 *
 * @param largeurPx, hauteurPx dimensions de l'image dessinée
 * @param taillePx taille minimale d'une case à l'écran pour l'étiqueter
 */
export function etiquettesProjetees(
  g: Grille,
  projeter: Projecteur,
  altitudeEn: (x: number, y: number) => number,
  largeurPx: number,
  hauteurPx: number,
  taillePx = 26,
): EtiquetteImage[] {
  const demi = g.pas / 2;
  const candidates: (EtiquetteImage & { taille: number })[] = [];
  for (const c of toutesLesCases(g)) {
    const centre = projeterSol(c.centre, projeter, altitudeEn);
    if (!centre || !dansImage(centre)) continue;
    // Taille apparente : écart entre les coins opposés de la case
    const a = projeterSol([c.centre[0] - demi, c.centre[1] - demi], projeter, altitudeEn);
    const b = projeterSol([c.centre[0] + demi, c.centre[1] + demi], projeter, altitudeEn);
    if (!a || !b) continue;
    const taille = Math.hypot((a.u - b.u) * largeurPx, (a.v - b.v) * hauteurPx);
    if (taille >= taillePx) candidates.push({ texte: c.texte, u: centre.u, v: centre.v, taille });
  }
  // Les cases les plus grandes à l'écran (les plus proches) d'abord
  candidates.sort((x, y) => y.taille - x.taille || x.texte.localeCompare(y.texte));
  const retenues: EtiquetteImage[] = [];
  for (const c of candidates) {
    const chevauche = retenues.some((e) => Math.abs((e.u - c.u) * largeurPx) < 30 && Math.abs((e.v - c.v) * hauteurPx) < 16);
    if (!chevauche) retenues.push({ texte: c.texte, u: c.u, v: c.v });
  }
  return retenues;
}
