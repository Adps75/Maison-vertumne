/**
 * Matériaux du projet — fonctions pures.
 *
 * Une surface (polygone, rectangle, cercle) porte un matériau de surface (m²). Un
 * tracé (polyligne) porte un matériau linéaire (ml) : tracé libre, ou bordure liée aux
 * côtés d'une surface (voir ./bordures.ts), dont la géométrie suit le contour.
 */

import { dist, surface, type Pt } from "../geo/plan";
import type { Element } from "../types";

export type TypeMateriau = "surface" | "lineaire";
export type Hachure = "aucune" | "diagonale" | "croisee" | "points";

export interface Materiau {
  id: string;
  nom: string;
  type: TypeMateriau;
  description_ia: string;
  couleur: string;
  hachure: Hachure;
  unite: "m2" | "ml";
  prix_unitaire: number | null;
  largeur_m: number | null;
  ordre: number;
  /** Texture répétable (bucket conception) et sa taille réelle en mètres (migration 00026). */
  texture_path?: string | null;
  texture_taille_m?: number | null;
  /** Hauteur hors sol d'un linéaire (volige, bordure), en mètres. */
  hauteur_m?: number | null;
}

/** URL de la texture d'un matériau (version = chemin, qui change à chaque remplacement). */
export function urlTexture(m: Materiau): string | null {
  return m.texture_path ? `/api/conception/materiaux/${m.id}/texture?v=${encodeURIComponent(m.texture_path)}` : null;
}

/** Couleurs franches de la carte des matériaux (une par matériau, dans l'ordre de la bibliothèque). */
export const COULEURS_CARTE: { hex: string; nom: string; rgb: [number, number, number] }[] = [
  { hex: "#FF0000", nom: "rouge", rgb: [255, 0, 0] },
  { hex: "#00FF00", nom: "vert", rgb: [0, 255, 0] },
  { hex: "#0000FF", nom: "bleu", rgb: [0, 0, 255] },
  { hex: "#FFFF00", nom: "jaune", rgb: [255, 255, 0] },
  { hex: "#FF00FF", nom: "magenta", rgb: [255, 0, 255] },
  { hex: "#00FFFF", nom: "cyan", rgb: [0, 255, 255] },
  { hex: "#FF8000", nom: "orange", rgb: [255, 128, 0] },
  { hex: "#8000FF", nom: "violet", rgb: [128, 0, 255] },
];

/** Couleur de carte de chaque matériau (stable : ordre de la bibliothèque). */
export function couleursCarte(materiaux: Materiau[]): Map<string, (typeof COULEURS_CARTE)[number]> {
  const tries = [...materiaux].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"));
  return new Map(tries.map((m, i) => [m.id, COULEURS_CARTE[i % COULEURS_CARTE.length]]));
}

/** Largeur minimale d'un linéaire dans le masque du rendu (m). */
export const LARGEUR_MIN_MASQUE = 0.3;

/** Contour fermé d'un élément (polygone, rectangle, cercle en 64 côtés), sinon null. */
export function contourFerme(el: Element): Pt[] | null {
  const g = el.geometrie;
  if ((g.type === "polygone" || g.type === "rectangle") && g.points.length >= 3) return g.points;
  if (g.type === "cercle") {
    const n = 64;
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return [g.centre[0] + g.rayon * Math.cos(a), g.centre[1] + g.rayon * Math.sin(a)] as Pt;
    });
  }
  return null;
}

/**
 * Côtés (d'une bordure) après insertion d'un sommet au milieu du côté `cote` : les deux
 * moitiés gardent l'état du côté coupé, les côtés suivants sont renumérotés.
 */
export function cotesApresInsertion(exclus: number[], cote: number): number[] {
  const sortie: number[] = [];
  for (const i of exclus) {
    if (i < cote) sortie.push(i);
    else if (i === cote) sortie.push(i, i + 1);
    else sortie.push(i + 1);
  }
  return [...new Set(sortie)].sort((a, b) => a - b);
}

/**
 * Côtés (d'une bordure) après suppression du sommet `sommet` d'un contour de `n`
 * sommets : ses deux côtés fusionnent (gardé seulement si les deux l'étaient), les
 * suivants sont renumérotés.
 */
export function cotesApresSuppressionSommet(exclus: number[], sommet: number, n: number): number[] {
  const ex = new Set(exclus);
  const avant = (sommet - 1 + n) % n;
  const sortie: number[] = [];
  // Ancien côté j → nouvel indice (contour de n − 1 sommets)
  const nouvelIndice = (j: number) => (sommet === 0 ? j - 1 : j < sommet ? j : j - 1);
  for (let j = 0; j < n; j++) {
    if (j === avant || j === sommet) continue;
    if (ex.has(j)) sortie.push(nouvelIndice(j));
  }
  if (ex.has(avant) && ex.has(sommet)) sortie.push(sommet === 0 ? n - 2 : sommet - 1);
  return sortie.sort((a, b) => a - b);
}

/** Segments d'un tracé linéaire (tracé libre ou bordure). */
export function segmentsLineaires(el: Element): [Pt, Pt][] {
  const g = el.geometrie;
  if (g.type !== "polyligne") return [];
  const s: [Pt, Pt][] = [];
  for (let i = 0; i < g.points.length - 1; i++) s.push([g.points[i], g.points[i + 1]]);
  return s;
}

/**
 * Côté d'un contour (polygone, rectangle) le plus proche du point, à moins de la
 * tolérance (m) ; null sinon. Les sommets et milieux restent aux poignées, testées avant.
 */
export function coteProche(el: Element, p: Pt, tolerance: number): number | null {
  if (el.geometrie.type !== "polygone" && el.geometrie.type !== "rectangle") return null;
  const c = el.geometrie.points;
  let meilleur: number | null = null, dMin = tolerance;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) continue;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    if (t <= 0 || t >= 1) continue;
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(p, q);
    if (d < dMin) { dMin = d; meilleur = i; }
  }
  return meilleur;
}

/** Quantité d'un élément selon le matériau : m² (surface) ou ml (linéaire). */
export function quantiteElement(el: Element, m: Materiau): number {
  if (m.type === "surface") {
    const g = el.geometrie;
    if (g.type === "cercle") return Math.PI * g.rayon * g.rayon;
    const c = contourFerme(el);
    return c ? surface(c) : 0;
  }
  return segmentsLineaires(el).reduce((s, [a, b]) => s + dist(a, b), 0);
}

/** Un matériau peut-il être posé sur cet élément ? (surface : contour fermé ; linéaire : tracé) */
export function materiauCompatible(el: Element, m: Materiau): boolean {
  if (m.type === "surface") return contourFerme(el) !== null;
  return el.geometrie.type === "polyligne";
}

/** Matériau porté par un élément (s'il existe et est compatible). */
export function materiauDe(el: Element, materiaux: Map<string, Materiau>): Materiau | null {
  const id = el.proprietes.materiau_id;
  if (typeof id !== "string") return null;
  const m = materiaux.get(id);
  return m && materiauCompatible(el, m) ? m : null;
}

export interface LigneQuantitatif {
  materiau: Materiau;
  /** Quantité arrondie au centième (m² ou ml). */
  quantite: number;
  /** Montant HT si le prix unitaire est connu. */
  montant: number | null;
  elements: number;
}

/** Quantitatif du plan : quantité par matériau (ordre de la bibliothèque). */
export function quantitesMateriaux(elements: Iterable<Element>, materiaux: Materiau[]): LigneQuantitatif[] {
  const parId = new Map(materiaux.map((m) => [m.id, m]));
  const totaux = new Map<string, { q: number; n: number }>();
  for (const el of elements) {
    if (el.statut === "supprime") continue;
    const m = materiauDe(el, parId);
    if (!m) continue;
    const t = totaux.get(m.id) ?? { q: 0, n: 0 };
    t.q += quantiteElement(el, m);
    t.n++;
    totaux.set(m.id, t);
  }
  return [...materiaux]
    .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"))
    .filter((m) => totaux.has(m.id))
    .map((m) => {
      const { q, n } = totaux.get(m.id)!;
      const quantite = Math.round(q * 100) / 100;
      return { materiau: m, quantite, montant: m.prix_unitaire != null ? Math.round(quantite * m.prix_unitaire * 100) / 100 : null, elements: n };
    });
}

/** Bande (quadrilatère) d'un segment, de la largeur donnée. */
function bande(a: Pt, b: Pt, largeur: number): Pt[] {
  const l = dist(a, b) || 1;
  const nx = (-(b[1] - a[1]) / l) * (largeur / 2), ny = ((b[0] - a[0]) / l) * (largeur / 2);
  // Prolongée d'une demi-largeur aux extrémités pour couvrir les angles
  const ex = ((b[0] - a[0]) / l) * (largeur / 2), ey = ((b[1] - a[1]) / l) * (largeur / 2);
  return [
    [a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny],
    [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny],
  ];
}

/**
 * Contours à inclure dans le masque du rendu réaliste pour les éléments portant un
 * matériau : la surface elle-même, ou une bande le long de chaque segment d'un linéaire
 * (largeur du matériau, au moins LARGEUR_MIN_MASQUE).
 */
export function contoursMasqueMateriaux(elements: Iterable<Element>, materiaux: Materiau[]): Pt[][] {
  const parId = new Map(materiaux.map((m) => [m.id, m]));
  const contours: Pt[][] = [];
  for (const el of elements) {
    if (el.statut === "supprime") continue;
    const m = materiauDe(el, parId);
    if (!m) continue;
    if (m.type === "surface") {
      const c = contourFerme(el);
      if (c) contours.push(c);
    } else {
      const largeur = Math.max(LARGEUR_MIN_MASQUE, m.largeur_m ?? 0);
      for (const [a, b] of segmentsLineaires(el)) contours.push(bande(a, b, largeur));
    }
  }
  return contours;
}

/** Centre (moyenne des sommets ou des milieux de segments) d'un élément. */
export function centreElement(el: Element, m: Materiau): Pt | null {
  const pts: Pt[] = m.type === "lineaire"
    ? segmentsLineaires(el).map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt)
    : contourFerme(el) ?? [];
  if (pts.length === 0) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Projection d'un point du plan dans la vue : abscisse image (0 gauche → 1 droite) et distance à la caméra. */
export type ProjeterVue = (p: Pt) => { u: number; distance: number } | null;

export interface MateriauDecrit {
  nom: string;
  description: string;
  quantite: number;
  unite: "m2" | "ml";
  /** Position par rapport au massif, vue depuis la caméra (« à gauche du massif, au premier plan »). */
  position: string;
}

/**
 * Position d'un élément par rapport au massif, vue depuis la caméra : gauche / droite
 * (abscisse dans l'image) et premier plan / arrière-plan (distance à la caméra).
 */
export function positionRelative(centre: Pt, massif: Pt | null, projeter: ProjeterVue): string {
  const e = projeter(centre);
  if (!e) return "hors du champ de la vue";
  if (!massif) return e.u < 0.35 ? "à gauche de la vue" : e.u > 0.65 ? "à droite de la vue" : "au centre de la vue";
  const m = projeter(massif);
  if (!m) return "hors du champ de la vue";
  const parties: string[] = [];
  const du = e.u - m.u;
  if (du < -0.08) parties.push("à gauche du massif");
  else if (du > 0.08) parties.push("à droite du massif");
  const dd = e.distance - m.distance;
  if (dd < -1) parties.push("devant le massif, au premier plan");
  else if (dd > 1) parties.push("derrière le massif");
  if (parties.length === 0) parties.push("dans le massif ou en bordure immédiate");
  return parties.join(", ");
}

/** Description des matériaux du projet pour la consigne du rendu (agrégés par matériau et position). */
export function decrireMateriaux(elements: Iterable<Element>, materiaux: Materiau[], massif: Pt | null, projeter: ProjeterVue): MateriauDecrit[] {
  const parId = new Map(materiaux.map((m) => [m.id, m]));
  const sortie: MateriauDecrit[] = [];
  for (const el of elements) {
    if (el.statut === "supprime") continue;
    const m = materiauDe(el, parId);
    if (!m) continue;
    const c = centreElement(el, m);
    if (!c) continue;
    const position = positionRelative(c, massif, projeter);
    if (position === "hors du champ de la vue") continue;
    const deja = sortie.find((s) => s.nom === m.nom && s.position === position);
    const q = quantiteElement(el, m);
    if (deja) deja.quantite = Math.round((deja.quantite + q) * 10) / 10;
    else sortie.push({ nom: m.nom, description: m.description_ia, quantite: Math.round(q * 10) / 10, unite: m.unite, position });
  }
  return sortie;
}
