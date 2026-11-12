/**
 * Placement déterministe des plantes d'une composition — fonctions pures.
 *
 * L'IA fournit l'intention (quantités, rôles, profondeurs, groupes, symétrie) ;
 * ce module calcule les positions :
 * - repère du massif : axe de profondeur (du fond vers le devant) et axe latéral ;
 * - bandes fond / milieu / devant, bordure le long du bord avant, couvre-sol en dernier ;
 * - structure géométrique : sujets de structure sur une trame régulière symétrique,
 *   puis masses et ponctuations en paires symétriques ;
 * - groupes répartis par échantillonnage « meilleur candidat » (Poisson approché)
 *   dans leur bande, sujets resserrés autour du centre du groupe ;
 * - contour et règle d'écartement respectés à chaque placement.
 * Même graine, même résultat.
 */

import { pointDansPolygone, projectionSurSegment, type Pt } from "../geo/plan";
import { ecartementMinimal, type VoisineInfo } from "../vegetaux/ecartement";
import { creerAleatoire } from "./aleatoire";
import { dansExclusion } from "./exclusions";
import type { RectPlan } from "./grille";
import type { Profondeur, Role } from "./schemas";

export interface PlanteAPlacer {
  /** Identifiant de la plante (bibliothèque). */
  cle: string;
  /** Rayon d'écartement (largeur à 3 ans / 2). */
  rayon: number;
  hauteur: number;
  categorie: string;
  forme: string | null;
  role: Role;
  profondeur: Profondeur;
  quantite: number;
  tailleGroupe: number;
  repetitions: number;
}

export interface ParametresPlacement {
  contour: Pt[];
  plantes: PlanteAPlacer[];
  /** Vecteur unitaire (plan) orienté du fond vers le devant du massif. */
  versDevant: Pt;
  geometrique: boolean;
  tolerance: number;
  /** Plantes déjà présentes (à respecter, non déplacées). */
  existantes: VoisineInfo[];
  graine: number;
  /** Zones d'exclusion (cases occupées par l'existant conservé), en mètres plan. */
  exclusions?: RectPlan[];
}

export interface Placement {
  cle: string;
  position: Pt;
}

export interface EcartQuantite {
  cle: string;
  demande: number;
  place: number;
}

export interface ResultatPlacement {
  placements: Placement[];
  ecarts: EcartQuantite[];
}

// ─── Repère du massif ──────────────────────────────────────────────────

export interface Repere {
  /** Axe de profondeur (vers le devant). */
  u: Pt;
  /** Axe latéral. */
  v: Pt;
  /** Origine : centre de la boîte du contour dans le repère. */
  origine: Pt;
  /** Bornes de la profondeur (d) et du latéral (l), relatives à l'origine. */
  dMin: number; dMax: number;
  lMin: number; lMax: number;
}

const prod = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

export function repereMassif(contour: Pt[], versDevant: Pt): Repere {
  const n = Math.hypot(versDevant[0], versDevant[1]) || 1;
  const u: Pt = [versDevant[0] / n, versDevant[1] / n];
  const v: Pt = [-u[1], u[0]];
  let dMin = Infinity, dMax = -Infinity, lMin = Infinity, lMax = -Infinity;
  for (const p of contour) {
    const d = prod(p, u), l = prod(p, v);
    dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
    lMin = Math.min(lMin, l); lMax = Math.max(lMax, l);
  }
  const dc = (dMin + dMax) / 2, lc = (lMin + lMax) / 2;
  const origine: Pt = [u[0] * dc + v[0] * lc, u[1] * dc + v[1] * lc];
  return { u, v, origine, dMin: dMin - dc, dMax: dMax - dc, lMin: lMin - lc, lMax: lMax - lc };
}

/** Point plan à partir de (profondeur relative s ∈ [0,1] du fond au devant, latéral l en m). */
export function versPlan(r: Repere, s: number, l: number): Pt {
  const d = r.dMin + s * (r.dMax - r.dMin);
  return [r.origine[0] + r.u[0] * d + r.v[0] * l, r.origine[1] + r.u[1] * d + r.v[1] * l];
}

/** Profondeur relative s ∈ [0,1] (0 = fond, 1 = devant) d'un point plan. */
export function profondeurRelative(r: Repere, p: Pt): number {
  const d = prod([p[0] - r.origine[0], p[1] - r.origine[1]], r.u);
  return (d - r.dMin) / Math.max(1e-9, r.dMax - r.dMin);
}

/** Coordonnée latérale (m) d'un point plan, 0 sur l'axe du massif. */
export function lateral(r: Repere, p: Pt): number {
  return prod([p[0] - r.origine[0], p[1] - r.origine[1]], r.v);
}

/** Symétrique d'un point par rapport à l'axe de profondeur du massif. */
export function symetrique(r: Repere, p: Pt): Pt {
  const l = lateral(r, p);
  return [p[0] - 2 * l * r.v[0], p[1] - 2 * l * r.v[1]];
}

// ─── Bandes de profondeur ──────────────────────────────────────────────

const BANDES: Record<Profondeur, [number, number]> = {
  fond: [0.04, 0.4],
  milieu: [0.33, 0.7],
  devant: [0.62, 0.96],
};

/** Bande de profondeur d'une plante (la bordure suit le bord avant). */
function bande(p: PlanteAPlacer): [number, number] {
  if (p.role === "bordure") return [0.82, 0.98];
  if (p.role === "couvre_sol") return [0.02, 0.98];
  return BANDES[p.profondeur];
}

// ─── Contraintes ───────────────────────────────────────────────────────

/** Distance d'un point au bord du contour. */
export function distanceAuBord(p: Pt, contour: Pt[]): number {
  let min = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    min = Math.min(min, projectionSurSegment(p, a, b).distance);
  }
  return min;
}

/** Marge minimale entre le pied d'une plante et le bord du massif. */
export function margeBord(rayon: number): number {
  return Math.min(0.5 * rayon, 0.4);
}

function info(p: PlanteAPlacer, position: Pt, id: string): VoisineInfo {
  return { id, position, rayon: p.rayon, categorie: p.categorie, forme: p.forme };
}

/** Position arrondie au millimètre (celle qui est enregistrée sur le plan). */
function arrondi(p: Pt): Pt {
  return [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
}

class Etat {
  voisines: VoisineInfo[];
  placements: Placement[] = [];
  private n = 0;

  constructor(private contour: Pt[], private tolerance: number, existantes: VoisineInfo[], private exclusions: RectPlan[] = []) {
    this.voisines = [...existantes];
  }

  valide(p: PlanteAPlacer, brute: Pt): boolean {
    // Vérifier la position telle qu'elle sera enregistrée (arrondie au millimètre)
    const pos = arrondi(brute);
    if (!pointDansPolygone(pos, this.contour)) return false;
    if (distanceAuBord(pos, this.contour) < margeBord(p.rayon)) return false;
    // Zones d'exclusion : cases occupées par l'existant conservé + écartement
    if (dansExclusion(pos, p.rayon, this.exclusions)) return false;
    const moi = info(p, pos, "?");
    for (const v of this.voisines) {
      const dMin = ecartementMinimal(moi, v, this.tolerance);
      if (dMin > 0 && Math.hypot(pos[0] - v.position[0], pos[1] - v.position[1]) < dMin) return false;
    }
    return true;
  }

  poser(p: PlanteAPlacer, brute: Pt) {
    const pos = arrondi(brute);
    this.voisines.push(info(p, pos, `c${this.n++}`));
    this.placements.push({ cle: p.cle, position: pos });
  }
}

// ─── Placement ─────────────────────────────────────────────────────────

/** Ordre de placement : structure, puis fond → devant (grands d'abord), bordure, couvre-sol. */
function ordre(p: PlanteAPlacer): number {
  if (p.role === "structure") return 0;
  if (p.role === "couvre_sol") return 9;
  if (p.role === "bordure") return 8;
  return 1 + ["fond", "milieu", "devant"].indexOf(p.profondeur) * 2 + (p.role === "ponctuation" ? 1 : 0);
}

/** Taille de groupe : impaire, au moins 1. */
export function groupeImpair(n: number): number {
  const k = Math.max(1, Math.round(n));
  return k % 2 === 1 ? k : k - 1;
}

export function placerComposition(params: ParametresPlacement): ResultatPlacement {
  const { contour, versDevant, geometrique, tolerance, existantes, graine, exclusions } = params;
  const alea = creerAleatoire(graine);
  const r = repereMassif(contour, versDevant);
  const etat = new Etat(contour, tolerance, existantes, exclusions);
  const largeur = r.lMax - r.lMin;

  // Hauteur relative de chaque plante dans sa bande (les plus hautes vers le fond)
  const plantes = [...params.plantes].sort((a, b) => ordre(a) - ordre(b) || b.hauteur - a.hauteur || a.cle.localeCompare(b.cle));
  const ecarts: EcartQuantite[] = [];

  for (const p of plantes) {
    const avant = etat.placements.length;
    if (geometrique && p.role === "structure") placerTrame(p, r, etat);
    else if (geometrique && p.role !== "couvre_sol") placerGroupesSymetriques(p, r, etat, alea, largeur);
    else placerGroupes(p, r, etat, alea, largeur);
    const place = etat.placements.length - avant;
    if (place !== p.quantite) ecarts.push({ cle: p.cle, demande: p.quantite, place });
  }

  return { placements: etat.placements, ecarts };
}

/** Sujets de structure : alignement régulier sur la ligne de leur bande, symétrique. */
function placerTrame(p: PlanteAPlacer, r: Repere, etat: Etat) {
  const [s0, s1] = bande(p);
  const n = p.quantite;
  // Lignes candidates, du centre de la bande vers ses bords
  const lignes = [(s0 + s1) / 2, s0 + (s1 - s0) * 0.3, s0 + (s1 - s0) * 0.7];
  for (const s of lignes) {
    for (let k = n; k >= 1; k--) {
      // k sujets répartis régulièrement et symétriquement de part et d'autre de l'axe
      const marge = Math.max(p.rayon, 0.4);
      const portee = (r.lMax - r.lMin) / 2 - marge;
      if (portee < 0) continue;
      const pas = k > 1 ? (2 * portee) / (k - 1) : 0;
      const positions: Pt[] = [];
      for (let i = 0; i < k; i++) positions.push(versPlan(r, s, k > 1 ? -portee + i * pas : 0));
      if (positionsValides(p, positions, etat)) {
        for (const pos of positions) etat.poser(p, pos);
        return;
      }
    }
  }
}

function positionsValides(p: PlanteAPlacer, positions: Pt[], etat: Etat): boolean {
  // Valide chacune, et entre elles
  const temp: Pt[] = [];
  for (const pos of positions) {
    if (!etat.valide(p, pos)) return false;
    for (const q of temp) {
      const dMin = ecartementMinimal(info(p, pos, "a"), info(p, q, "b"), 0);
      if (Math.hypot(pos[0] - q[0], pos[1] - q[1]) < dMin * 0.999) return false;
    }
    temp.push(pos);
  }
  return true;
}

/** Centres de groupes bien répartis (meilleur candidat parmi k tirages). */
function centresGroupes(n: number, s0: number, s1: number, r: Repere, alea: () => number, lMin: number, lMax: number): Pt[] {
  const centres: [number, number][] = []; // (s, l)
  const echelleS = r.dMax - r.dMin;
  for (let i = 0; i < n; i++) {
    let meilleur: [number, number] | null = null;
    let meilleurScore = -Infinity;
    for (let k = 0; k < 12; k++) {
      const c: [number, number] = [s0 + alea() * (s1 - s0), lMin + alea() * (lMax - lMin)];
      let score = Infinity;
      for (const d of centres) score = Math.min(score, Math.hypot((c[0] - d[0]) * echelleS, c[1] - d[1]));
      if (score > meilleurScore) { meilleurScore = score; meilleur = c; }
    }
    centres.push(meilleur!);
  }
  return centres.map(([s, l]) => versPlan(r, s, l));
}

/** Sujets d'un groupe autour de son centre (spirale resserrée, perturbée). */
function sujetsAutour(centre: Pt, p: PlanteAPlacer, alea: () => number): Pt[] {
  const pas = 2 * p.rayon;
  const candidats: Pt[] = [centre];
  for (let i = 1; i < 60; i++) {
    const rayon = pas * Math.sqrt(i) * 0.75;
    const angle = i * 2.39996323 + alea() * 0.3; // angle d'or
    candidats.push([centre[0] + rayon * Math.cos(angle), centre[1] + rayon * Math.sin(angle)]);
  }
  return candidats;
}

function placerGroupes(p: PlanteAPlacer, r: Repere, etat: Etat, alea: () => number, largeur: number) {
  const [s0, s1] = bande(p);
  const taille = groupeImpair(p.tailleGroupe);
  const nbGroupes = Math.max(1, Math.max(p.repetitions, Math.ceil(p.quantite / taille)));
  const centres = centresGroupes(nbGroupes, s0, s1, r, alea, r.lMin + 0.05 * largeur, r.lMax - 0.05 * largeur);
  let restant = p.quantite;
  for (let g = 0; g < centres.length && restant > 0; g++) {
    const objectif = Math.min(restant, Math.ceil(restant / (centres.length - g)));
    let poses = 0;
    for (const c of sujetsAutour(centres[g], p, alea)) {
      if (poses >= objectif) break;
      const s = profondeurRelative(r, c);
      if (s < s0 - 0.02 || s > s1 + 0.02) continue;
      if (etat.valide(p, c)) { etat.poser(p, c); poses++; }
    }
    restant -= poses;
  }
  // Complément : n'importe où dans la bande (tirages déterministes)
  for (let essai = 0; restant > 0 && essai < 400; essai++) {
    const c = versPlan(r, s0 + alea() * (s1 - s0), r.lMin + alea() * largeur);
    if (etat.valide(p, c)) { etat.poser(p, c); restant--; }
  }
}

/** Masses et ponctuations en mode géométrique : paires symétriques (et centre). */
function placerGroupesSymetriques(p: PlanteAPlacer, r: Repere, etat: Etat, alea: () => number, largeur: number) {
  const [s0, s1] = bande(p);
  let restant = p.quantite;
  // Un sujet sur l'axe si la quantité est impaire
  if (restant % 2 === 1) {
    for (let essai = 0; essai < 60; essai++) {
      const c = versPlan(r, s0 + alea() * (s1 - s0), 0);
      if (etat.valide(p, c)) { etat.poser(p, c); restant--; break; }
    }
  }
  // Paires : côté droit tiré au hasard, côté gauche symétrique
  for (let essai = 0; restant >= 2 && essai < 600; essai++) {
    const s = s0 + alea() * (s1 - s0);
    const l = (0.08 + 0.87 * alea()) * (largeur / 2);
    const droite = versPlan(r, s, l);
    const gauche = symetrique(r, droite);
    if (!etat.valide(p, droite)) continue;
    etat.poser(p, droite);
    if (etat.valide(p, gauche)) {
      etat.poser(p, gauche);
      restant -= 2;
    } else {
      // Pas de symétrique possible : on retire le sujet pour garder la symétrie
      etat.placements.pop();
      etat.voisines.pop();
    }
  }
}
