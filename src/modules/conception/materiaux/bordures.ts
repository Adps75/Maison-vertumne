/**
 * Bordures liées aux surfaces — fonctions pures.
 *
 * Une bordure est un élément linéaire distinct (type « limite », géométrie polyligne)
 * portant un matériau linéaire et lié aux côtés choisis d'une surface :
 *   proprietes = { materiau_id, bordure_de: <id de la surface>, cotes: [i, i+1, …] }
 * Le côté i va du sommet i au sommet i + 1. Les côtés d'une bordure sont contigus ; des
 * côtés non contigus donnent une bordure par suite. Sa géométrie est recalculée à chaque
 * modification du contour. Un côté ne porte qu'une bordure.
 */

import type { Pt } from "../geo/plan";
import type { PartieDecoupe } from "../geo/decoupe";
import type { Element } from "../types";
import { cotesApresInsertion, cotesApresSuppressionSommet } from "./materiaux";

/** Contour d'une surface pouvant porter des bordures (polygone ou rectangle). */
export function contourBordable(el: Element): Pt[] | null {
  const g = el.geometrie;
  return (g.type === "polygone" || g.type === "rectangle") && g.points.length >= 3 ? g.points : null;
}

export function estBordure(el: Element): boolean {
  return typeof el.proprietes.bordure_de === "string";
}

/** Côtés d'une bordure (indices entiers valides pour un contour de n sommets). */
export function cotesBordure(el: Element, n: number): number[] {
  const c = el.proprietes.cotes;
  if (!Array.isArray(c)) return [];
  return c.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < n);
}

/**
 * Suites de côtés contigus (le dernier côté touche le premier). Chaque suite est donnée
 * dans l'ordre du contour.
 */
export function suitesContigues(cotes: number[], n: number): number[][] {
  const set = [...new Set(cotes.filter((i) => i >= 0 && i < n))].sort((a, b) => a - b);
  if (set.length === 0) return [];
  if (set.length === n) return [Array.from({ length: n }, (_, i) => i)];
  const suites: number[][] = [];
  let cur = [set[0]];
  for (let k = 1; k < set.length; k++) {
    if (set[k] === set[k - 1] + 1) cur.push(set[k]);
    else { suites.push(cur); cur = [set[k]]; }
  }
  suites.push(cur);
  // Raccord autour du sommet 0 : côté n-1 suivi du côté 0
  if (suites.length > 1 && suites[0][0] === 0 && suites[suites.length - 1].at(-1) === n - 1) {
    const premiere = suites.shift()!;
    suites[suites.length - 1] = [...suites[suites.length - 1], ...premiere];
  }
  return suites;
}

/** Chemin d'une suite de côtés contigus : sommets successifs (fermé si tous les côtés). */
export function cheminBordure(contour: Pt[], suite: number[]): Pt[] {
  const n = contour.length;
  if (suite.length === 0) return [];
  const pts: Pt[] = [contour[suite[0]]];
  for (const i of suite) pts.push(contour[(i + 1) % n]);
  return pts;
}

/** Côtés de la surface déjà portés par une bordure (côté → id de la bordure). */
export function cotesOccupes(surface: Element, elements: Iterable<Element>): Map<number, string> {
  const n = contourBordable(surface)?.length ?? 0;
  const occupes = new Map<number, string>();
  for (const el of elements) {
    if (el.proprietes.bordure_de !== surface.id || el.statut === "supprime") continue;
    for (const c of cotesBordure(el, n)) occupes.set(c, el.id);
  }
  return occupes;
}

export type ResultatBordures = { ok: true; elements: Element[] } | { ok: false; erreur: string };

/** Crée les bordures (une par suite de côtés contigus) d'une surface. */
export function creerBordures(p: {
  surface: Element;
  cotes: number[];
  materiauId: string;
  existants: Iterable<Element>;
  genererId: () => string;
  ordre: number;
}): ResultatBordures {
  const contour = contourBordable(p.surface);
  if (!contour) return { ok: false, erreur: "Une bordure se pose sur les côtés d'un polygone ou d'un rectangle." };
  const n = contour.length;
  const choisis = [...new Set(p.cotes)].filter((i) => i >= 0 && i < n);
  if (choisis.length === 0) return { ok: false, erreur: "Choisissez au moins un côté de la surface." };
  const occupes = cotesOccupes(p.surface, p.existants);
  const deja = choisis.filter((c) => occupes.has(c));
  if (deja.length > 0) {
    return { ok: false, erreur: deja.length === 1 ? "Ce côté porte déjà une bordure." : `${deja.length} des côtés choisis portent déjà une bordure.` };
  }
  const elements = suitesContigues(choisis, n).map((suite, i): Element => ({
    id: p.genererId(),
    type: "limite",
    geometrie: { type: "polyligne", points: cheminBordure(contour, suite) },
    calque: p.surface.calque,
    statut: "nouveau",
    hauteur: null,
    proprietes: { materiau_id: p.materiauId, bordure_de: p.surface.id, cotes: suite },
    ordre: p.ordre + i,
  }));
  return { ok: true, elements };
}

/**
 * Bordure recalculée après une modification du contour de sa surface : géométrie suivant
 * le contour, côtés renumérotés si un sommet a été inséré ou supprimé. Les côtés qui ne
 * se suivent plus donnent plusieurs bordures (la première garde l'identifiant). Aucune
 * bordure si plus aucun côté.
 */
export function borduresRecalculees(p: {
  bordure: Element;
  surface: Element;
  /** Changement de sommets du contour : insertion au milieu d'un côté, ou suppression. */
  changement?: ChangementContour;
  genererId: () => string;
}): Element[] {
  const contour = contourBordable(p.surface);
  if (!contour) return [];
  const brut = Array.isArray(p.bordure.proprietes.cotes) ? (p.bordure.proprietes.cotes as number[]) : [];
  let cotes = brut;
  if (p.changement?.type === "insertion") cotes = cotesApresInsertion(brut, p.changement.cote);
  if (p.changement?.type === "suppression") cotes = cotesApresSuppressionSommet(brut, p.changement.sommet, p.changement.nAvant);
  const suites = suitesContigues(cotes, contour.length);
  return suites.map((suite, i) => ({
    ...p.bordure,
    id: i === 0 ? p.bordure.id : p.genererId(),
    geometrie: { type: "polyligne" as const, points: cheminBordure(contour, suite) },
    proprietes: { ...p.bordure.proprietes, cotes: suite },
  }));
}

export type ChangementContour = { type: "insertion"; cote: number } | { type: "suppression"; sommet: number; nAvant: number };

/**
 * Bordures à mettre à jour après la modification de surfaces (contour déplacé, sommet
 * ajouté ou supprimé) : géométrie recalculée, divisée ou supprimée si plus aucun côté.
 * Les bordures déjà présentes dans `modifies` sont laissées telles quelles.
 */
export function propagerBordures(p: {
  elements: Map<string, Element>;
  modifies: Element[];
  changements?: Record<string, ChangementContour>;
  genererId: () => string;
  /** Éléments supprimés dans la même action (à ne pas recalculer). */
  ignorer?: string[];
}): { majs: Element[]; suppressions: string[] } {
  const dejaFournis = new Set([...p.modifies.map((e) => e.id), ...(p.ignorer ?? [])]);
  const surfaces = new Map(p.modifies.filter((e) => contourBordable(e)).map((e) => [e.id, e]));
  const majs: Element[] = [];
  const suppressions: string[] = [];
  if (surfaces.size === 0) return { majs, suppressions };
  for (const el of p.elements.values()) {
    const s = typeof el.proprietes.bordure_de === "string" ? surfaces.get(el.proprietes.bordure_de) : undefined;
    if (!s || dejaFournis.has(el.id)) continue;
    const r = borduresRecalculees({ bordure: el, surface: s, changement: p.changements?.[s.id], genererId: p.genererId });
    if (r.length === 0) suppressions.push(el.id);
    else majs.push(...r);
  }
  return { majs, suppressions };
}

/** Bordures liées aux surfaces données (à supprimer avec elles). */
export function borduresDe(elements: Iterable<Element>, idsSurfaces: Set<string>): string[] {
  const ids: string[] = [];
  for (const el of elements) if (typeof el.proprietes.bordure_de === "string" && idsSurfaces.has(el.proprietes.bordure_de)) ids.push(el.id);
  return ids;
}

/**
 * Bordures après la découpe de leur surface : chaque côté d'origine est suivi dans la
 * partie qui le contient ; une bordure partagée entre les deux parties est divisée.
 */
export function borduresApresDecoupe(p: {
  bordures: Element[];
  parties: [PartieDecoupe, PartieDecoupe];
  /** Identifiants des surfaces issues de la découpe (même ordre que les parties). */
  idsParties: [string, string];
  genererId: () => string;
}): Element[] {
  const sortie: Element[] = [];
  for (const b of p.bordures) {
    const origine = new Set(Array.isArray(b.proprietes.cotes) ? (b.proprietes.cotes as number[]) : []);
    let premier = true;
    p.parties.forEach((partie, k) => {
      const cotes = partie.origines.map((o, i) => (origine.has(o) ? i : -1)).filter((i) => i >= 0);
      for (const suite of suitesContigues(cotes, partie.points.length)) {
        sortie.push({
          ...b,
          id: premier ? b.id : p.genererId(),
          geometrie: { type: "polyligne", points: cheminBordure(partie.points, suite) },
          proprietes: { ...b.proprietes, bordure_de: p.idsParties[k], cotes: suite },
        });
        premier = false;
      }
    });
  }
  return sortie;
}
