/**
 * Découpe d'une surface par une ligne ou une polyligne — fonctions pures.
 *
 * La ligne doit traverser le contour exactement deux fois (une entrée, une sortie) ; la
 * partie entre ces deux points devient le bord commun des deux nouvelles surfaces.
 * Chaque côté des surfaces obtenues garde la trace du côté d'origine dont il provient
 * (-1 pour le bord de coupe), ce qui permet aux bordures liées de suivre leurs côtés.
 */

import { surface, type Pt } from "./plan";

export interface PartieDecoupe {
  points: Pt[];
  /** Pour chaque côté k (du sommet k au sommet k + 1) : côté d'origine, ou -1 (coupe). */
  origines: number[];
}

export type ResultatDecoupe =
  | { ok: true; parties: [PartieDecoupe, PartieDecoupe] }
  | { ok: false; erreur: string };

interface Intersection {
  /** Indice du segment de la ligne et position sur ce segment (0–1). */
  segment: number;
  tLigne: number;
  /** Côté du contour coupé et position sur ce côté (0–1). */
  cote: number;
  tCote: number;
  point: Pt;
}

function intersecter(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number } | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]];
  const s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const qp: Pt = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u };
}

const proche = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** Découpe le polygone `contour` par la polyligne `ligne`. */
export function decouperPolygone(contour: Pt[], ligne: Pt[]): ResultatDecoupe {
  const n = contour.length;
  if (n < 3 || ligne.length < 2) return { ok: false, erreur: "Tracez une ligne d'au moins deux points à travers la surface." };

  const inters: Intersection[] = [];
  for (let s = 0; s < ligne.length - 1; s++) {
    for (let k = 0; k < n; k++) {
      const r = intersecter(ligne[s], ligne[s + 1], contour[k], contour[(k + 1) % n]);
      if (!r) continue;
      const point: Pt = [ligne[s][0] + r.t * (ligne[s + 1][0] - ligne[s][0]), ligne[s][1] + r.t * (ligne[s + 1][1] - ligne[s][1])];
      // Un passage exact par un sommet est compté une seule fois
      if (inters.some((i) => proche(i.point, point))) continue;
      inters.push({ segment: s, tLigne: r.t, cote: k, tCote: Math.min(1, Math.max(0, r.u)), point });
    }
  }
  if (inters.length !== 2) {
    return { ok: false, erreur: inters.length < 2
      ? "La ligne doit traverser la surface de part en part (deux croisements avec le contour)."
      : "La ligne doit traverser la surface une seule fois (deux croisements avec le contour, pas plus)." };
  }
  inters.sort((a, b) => a.segment - b.segment || a.tLigne - b.tLigne);
  const [e, s] = inters;
  // Chaîne de coupe : entrée, sommets intérieurs de la ligne, sortie
  const chaine: Pt[] = [e.point];
  for (let i = e.segment + 1; i <= s.segment; i++) chaine.push(ligne[i]);
  chaine.push(s.point);

  // Parcours du contour de l'entrée vers la sortie (sens du contour)
  const parcours = (de: Intersection, a: Intersection): { pts: Pt[]; orig: number[] } => {
    const pts: Pt[] = [de.point];
    const orig: number[] = [];
    let k = de.cote;
    if (k === a.cote && de.tCote < a.tCote) {
      orig.push(k);
      pts.push(a.point);
      return { pts, orig };
    }
    for (let pas = 0; pas < n; pas++) {
      orig.push(k);
      const suivant = (k + 1) % n;
      pts.push(contour[suivant]);
      k = suivant;
      if (k === a.cote) break;
    }
    orig.push(a.cote);
    pts.push(a.point);
    return { pts, orig };
  };

  const finir = (bord: { pts: Pt[]; orig: number[] }, retour: Pt[]): PartieDecoupe => {
    // bord : de X à Y le long du contour ; retour : de Y à X le long de la coupe (sommets intérieurs)
    const points = [...bord.pts, ...retour];
    const origines = [...bord.orig, ...retour.map(() => -1), -1];
    // Supprimer les sommets en double (passage par un sommet, coupe sur un sommet)
    const p2: Pt[] = [], o2: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const suivant = points[(i + 1) % points.length];
      if (proche(points[i], suivant)) continue;
      p2.push(points[i]);
      o2.push(origines[i]);
    }
    return { points: p2, origines: o2 };
  };

  const interieur = chaine.slice(1, -1);
  const a = finir(parcours(e, s), [...interieur].reverse());
  const b = finir(parcours(s, e), interieur);
  if (a.points.length < 3 || b.points.length < 3 || surface(a.points) < 1e-6 || surface(b.points) < 1e-6) {
    return { ok: false, erreur: "La découpe donnerait une surface vide." };
  }
  return { ok: true, parties: [a, b] };
}
