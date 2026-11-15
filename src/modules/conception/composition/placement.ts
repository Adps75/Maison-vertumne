/**
 * Placement déterministe des plantes d'une composition — fonctions pures.
 *
 * L'IA fournit l'intention : part de surface de chaque espèce (ou nombre fixe pour la
 * structure et la ponctuation), rôle, profondeur, groupes, répétitions. Ce module :
 * - calcule la surface plantable (contour moins les cercles de l'existant conservé) ;
 * - calcule les quantités : part de surface / surface occupée par plante à 3 ans selon
 *   la densité (cellule hexagonale de côté k × largeur à 3 ans) ;
 * - mesure la profondeur de chaque point par sa distance au point de vue principal
 *   (0 = fond, 1 = devant), ce qui reste juste pour un contour concave ou en L ;
 * - découpe la surface en « taches » (une par répétition d'espèce) suivant un gradient
 *   continu : hautes au fond, basses devant, sans bandes étroites ;
 * - répartit les plantes de chaque tache (échantillonnage de Poisson puis relaxation
 *   de Lloyd), en respectant le contour, l'écartement et les exclusions ;
 * - comble les vides jusqu'à la couverture visée.
 * Même graine, même résultat.
 */

import { pointDansPolygone, projectionSurSegment, type Pt } from "../geo/plan";
import { ecartementMinimal, type VoisineInfo } from "../vegetaux/ecartement";
import { creerAleatoire } from "./aleatoire";
import type { Profondeur, Role } from "./schemas";

export type Densite = "serree" | "standard" | "aeree";

/** Espacement entre plantes voisines, en fraction de la largeur à 3 ans. */
export const COEF_ESPACEMENT: Record<Densite, number> = { serree: 0.8, standard: 0.9, aeree: 1 };
/** Couverture visée à 3 ans (part de la surface plantable sous les couronnes). */
export const COUVERTURE_CIBLE: Record<Densite, number> = { serree: 0.92, standard: 0.85, aeree: 0.75 };

/** Rôles à nombre fixe (sujets comptés, et non surface). */
export const ROLES_NOMBRE_FIXE: Role[] = ["structure", "ponctuation"];

export interface PlanteAPlacer {
  /** Identifiant de la plante (bibliothèque). */
  cle: string;
  /** Rayon à 3 ans (largeur à 3 ans / 2). */
  rayon: number;
  hauteur: number;
  categorie: string;
  forme: string | null;
  role: Role;
  profondeur: Profondeur;
  /** Part de la surface plantable restante (0–1) ; ignorée si `nombre` est donné. */
  part: number;
  /** Nombre fixe de sujets (structure, ponctuation), sinon null. */
  nombre: number | null;
  tailleGroupe: number;
  repetitions: number;
}

/** Emprise réelle d'un élément existant conservé. */
export interface CercleExclusion {
  centre: Pt;
  rayon: number;
  libelle?: string;
}

export interface ParametresPlacement {
  contour: Pt[];
  plantes: PlanteAPlacer[];
  /** Vecteur unitaire (plan) orienté du fond vers le devant (repli et axe de symétrie). */
  versDevant: Pt;
  /** Position (plan) du point de vue principal : la profondeur suit la distance à ce point. */
  observateur?: Pt | null;
  geometrique: boolean;
  tolerance: number;
  densite: Densite;
  /** Plantes déjà présentes (à respecter, non déplacées). */
  existantes: VoisineInfo[];
  graine: number;
  /** Existant conservé : aucune plante dans son emprise. */
  exclusions?: CercleExclusion[];
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
  /** Espèces nettement en dessous de la quantité calculée. */
  ecarts: EcartQuantite[];
  /** Quantité calculée par espèce. */
  quantites: Record<string, number>;
  /** Surface plantable (m²) : contour moins l'existant conservé. */
  surfacePlantable: number;
  /** Part de la surface plantable couverte par les couronnes à 3 ans (0–1). */
  couverture: number;
}

// ─── Repère du massif (symétrie, repli de profondeur) ──────────────────

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

/** Profondeur relative s ∈ [0,1] (0 = fond, 1 = devant) d'un point plan, le long de l'axe. */
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

/** Taille de groupe : impaire, au moins 1. */
export function groupeImpair(n: number): number {
  const k = Math.max(1, Math.round(n));
  return k % 2 === 1 ? k : k - 1;
}

/** Le point est-il dans l'emprise d'un existant conservé ? */
export function dansCercles(p: Pt, cercles: CercleExclusion[], marge = 0): boolean {
  return cercles.some((c) => Math.hypot(p[0] - c.centre[0], p[1] - c.centre[1]) < c.rayon + marge);
}

/** Espacement effectif (fraction de la largeur à 3 ans), jamais sous le minimum autorisé. */
export function coefEspacement(densite: Densite, tolerance: number): number {
  return Math.max(COEF_ESPACEMENT[densite], 1 - tolerance);
}

/** Surface occupée par une plante à 3 ans (cellule hexagonale), en m². */
export function surfaceParPlante(rayon: number, coef: number): number {
  const e = 2 * rayon * coef;
  return (e * e * Math.sqrt(3)) / 2;
}

/**
 * Quantités : nombre fixe pour la structure et la ponctuation, puis répartition de la
 * surface restante selon les parts (normalisées) et la surface occupée par plante.
 */
export function quantitesCalculees(plantes: PlanteAPlacer[], surfacePlantable: number, coef: number): Map<string, number> {
  const q = new Map<string, number>();
  let restante = surfacePlantable;
  for (const p of plantes) {
    if (p.nombre === null) continue;
    const n = Math.max(1, Math.round(p.nombre));
    q.set(p.cle, n);
    restante -= n * surfaceParPlante(p.rayon, coef);
  }
  restante = Math.max(0, restante);
  const libres = plantes.filter((p) => p.nombre === null);
  const somme = libres.reduce((s, p) => s + Math.max(0, p.part), 0);
  for (const p of libres) {
    const part = somme > 0 ? Math.max(0, p.part) / somme : 1 / libres.length;
    const n = part > 0 ? Math.max(1, Math.round((part * restante) / surfaceParPlante(p.rayon, coef))) : 0;
    q.set(p.cle, n);
  }
  return q;
}

// ─── Grille de calcul (cellules plantables) ────────────────────────────

interface Grille {
  pas: number;
  x0: number; y0: number; nx: number; ny: number;
  /** Indice de cellule plantable par case de la grille, -1 sinon. */
  index: Int32Array;
  xs: number[]; ys: number[];
  /** Profondeur 0 (fond) → 1 (devant) de chaque cellule. */
  s: number[];
}

function boite(contour: Pt[]) {
  const xs = contour.map((p) => p[0]), ys = contour.map((p) => p[1]);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

function construireGrille(contour: Pt[], exclusions: CercleExclusion[], profondeurBrute: (p: Pt) => number, pasImpose?: number): Grille {
  const b = boite(contour);
  const aire = Math.max(1, (b.xMax - b.xMin) * (b.yMax - b.yMin));
  const pas = pasImpose ?? Math.min(0.25, Math.max(0.08, Math.sqrt(aire / 12000)));
  const nx = Math.max(1, Math.ceil((b.xMax - b.xMin) / pas));
  const ny = Math.max(1, Math.ceil((b.yMax - b.yMin) / pas));
  const index = new Int32Array(nx * ny).fill(-1);
  const xs: number[] = [], ys: number[] = [], brut: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Pt = [b.xMin + (i + 0.5) * pas, b.yMin + (j + 0.5) * pas];
    if (!pointDansPolygone(p, contour) || dansCercles(p, exclusions)) continue;
    index[j * nx + i] = xs.length;
    xs.push(p[0]); ys.push(p[1]); brut.push(profondeurBrute(p));
  }
  const min = Math.min(...brut), max = Math.max(...brut);
  const s = brut.map((v) => (max - min > 1e-9 ? (v - min) / (max - min) : 0.5));
  return { pas, x0: b.xMin, y0: b.yMin, nx, ny, index, xs, ys, s };
}

function celluleDe(g: Grille, p: Pt): number {
  const i = Math.floor((p[0] - g.x0) / g.pas), j = Math.floor((p[1] - g.y0) / g.pas);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
  return g.index[j * g.nx + i];
}

/** Cellules dont le centre est à moins de `rayon` du point. */
function cellulesDansDisque(g: Grille, c: Pt, rayon: number, rappel: (k: number) => void) {
  const i0 = Math.max(0, Math.floor((c[0] - rayon - g.x0) / g.pas)), i1 = Math.min(g.nx - 1, Math.floor((c[0] + rayon - g.x0) / g.pas));
  const j0 = Math.max(0, Math.floor((c[1] - rayon - g.y0) / g.pas)), j1 = Math.min(g.ny - 1, Math.floor((c[1] + rayon - g.y0) / g.pas));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = g.index[j * g.nx + i];
    if (k < 0) continue;
    if (Math.hypot(g.xs[k] - c[0], g.ys[k] - c[1]) <= rayon) rappel(k);
  }
}

/**
 * Couverture : part de la surface plantable (contour moins exclusions) située sous
 * au moins une couronne à 3 ans. Échantillonnage régulier (5 cm par défaut).
 */
export function couvertureSurface(params: {
  contour: Pt[];
  exclusions?: CercleExclusion[];
  plantes: { position: Pt; rayon: number }[];
  pas?: number;
}): { couverture: number; surfacePlantable: number } {
  const g = construireGrille(params.contour, params.exclusions ?? [], () => 0, params.pas ?? 0.05);
  const n = g.xs.length;
  if (n === 0) return { couverture: 0, surfacePlantable: 0 };
  const couvert = new Uint8Array(n);
  for (const p of params.plantes) cellulesDansDisque(g, p.position, p.rayon, (k) => { couvert[k] = 1; });
  let c = 0;
  for (let k = 0; k < n; k++) c += couvert[k];
  return { couverture: c / n, surfacePlantable: n * g.pas * g.pas };
}

// ─── État du placement ─────────────────────────────────────────────────

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
  couvert: Uint8Array;
  nbCouvert = 0;
  private n = 0;

  constructor(
    private contour: Pt[], private tolerance: number, existantes: VoisineInfo[],
    private exclusions: CercleExclusion[], private g: Grille,
  ) {
    this.voisines = [...existantes];
    this.couvert = new Uint8Array(g.xs.length);
    // Couronnes des plantes déjà présentes
    for (const v of existantes) this.couvrir(v.position, v.rayon);
  }

  private couvrir(c: Pt, rayon: number) {
    cellulesDansDisque(this.g, c, rayon, (k) => { if (!this.couvert[k]) { this.couvert[k] = 1; this.nbCouvert++; } });
  }

  couverture(): number {
    return this.g.xs.length > 0 ? this.nbCouvert / this.g.xs.length : 1;
  }

  valide(p: PlanteAPlacer, brute: Pt): boolean {
    // Vérifier la position telle qu'elle sera enregistrée (arrondie au millimètre)
    const pos = arrondi(brute);
    if (!pointDansPolygone(pos, this.contour)) return false;
    if (distanceAuBord(pos, this.contour) < margeBord(p.rayon)) return false;
    // Emprise de l'existant conservé, plus l'écartement de la plante
    if (dansCercles(pos, this.exclusions, p.rayon * (1 - this.tolerance))) return false;
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
    this.couvrir(pos, p.rayon);
  }

  /** Pose un sujet et son symétrique (ou un seul sujet sur l'axe), tout ou rien. */
  poserSymetrique(p: PlanteAPlacer, pos: Pt, r: Repere): number {
    const l = lateral(r, pos);
    if (Math.abs(l) < p.rayon * 0.5) {
      const surAxe: Pt = [pos[0] - l * r.v[0], pos[1] - l * r.v[1]];
      if (!this.valide(p, surAxe)) return 0;
      this.poser(p, surAxe);
      return 1;
    }
    const miroir = symetrique(r, pos);
    if (!this.valide(p, pos)) return 0;
    // Le symétrique est vérifié avec le premier sujet en place
    this.voisines.push(info(p, arrondi(pos), "tmp"));
    const ok = this.valide(p, miroir);
    this.voisines.pop();
    if (!ok) return 0;
    this.poser(p, pos);
    this.poser(p, miroir);
    return 2;
  }
}

// ─── Profondeur cible des espèces ──────────────────────────────────────

const PROFONDEUR_IA: Record<Profondeur, number> = { fond: 0.15, milieu: 0.5, devant: 0.85 };

/**
 * Profondeur cible (0 = fond, 1 = devant) : rang de hauteur (hautes au fond) combiné à
 * la profondeur choisie par l'IA ; la bordure suit le devant ; le couvre-sol n'en a pas.
 */
export function profondeursCibles(plantes: PlanteAPlacer[]): Map<string, number | null> {
  const etagees = plantes.filter((p) => p.role !== "couvre_sol" && p.role !== "bordure");
  const triees = [...etagees].sort((a, b) => b.hauteur - a.hauteur || a.cle.localeCompare(b.cle));
  const cibles = new Map<string, number | null>();
  triees.forEach((p, i) => {
    const rang = triees.length > 1 ? 0.1 + (0.75 * i) / (triees.length - 1) : 0.5;
    cibles.set(p.cle, 0.5 * rang + 0.5 * PROFONDEUR_IA[p.profondeur]);
  });
  for (const p of plantes) {
    if (p.role === "bordure") cibles.set(p.cle, 0.94);
    if (p.role === "couvre_sol") cibles.set(p.cle, null);
  }
  return cibles;
}

// ─── Placement ─────────────────────────────────────────────────────────

/** Poids de la profondeur dans le choix des taches (gradient continu, pas des bandes). */
const LAMBDA_PROFONDEUR = 0.5;
const LAMBDA_BORDURE = 12;

export function placerComposition(params: ParametresPlacement): ResultatPlacement {
  const { contour, versDevant, geometrique, tolerance, existantes, graine, densite } = params;
  const exclusions = params.exclusions ?? [];
  const alea = creerAleatoire(graine);
  const r = repereMassif(contour, versDevant);
  const obs = params.observateur ?? null;
  // Profondeur brute : plus grand = plus près du point de vue (devant)
  const profondeurBrute = obs
    ? (p: Pt) => -Math.hypot(p[0] - obs[0], p[1] - obs[1])
    : (p: Pt) => prod(p, r.u);
  const g = construireGrille(contour, exclusions, profondeurBrute);
  const nCellules = g.xs.length;
  const aireCellule = g.pas * g.pas;
  const surfacePlantable = nCellules * aireCellule;
  const etat = new Etat(contour, tolerance, existantes, exclusions, g);
  const coef = coefEspacement(densite, tolerance);
  const quantites = quantitesCalculees(params.plantes, surfacePlantable, coef);
  const cibles = profondeursCibles(params.plantes);
  const parCle = new Map(params.plantes.map((p) => [p.cle, p]));
  const poses = new Map<string, number>(params.plantes.map((p) => [p.cle, 0]));
  const compter = (p: PlanteAPlacer, n: number) => poses.set(p.cle, (poses.get(p.cle) ?? 0) + n);

  if (nCellules === 0) {
    return { placements: [], ecarts: [], quantites: Object.fromEntries(quantites), surfacePlantable: 0, couverture: 0 };
  }

  // Cellules de travail : la moitié droite en mode géométrique (puis symétrie)
  const demi = geometrique;
  const travail: number[] = [];
  for (let k = 0; k < nCellules; k++) if (!demi || lateral(r, [g.xs[k], g.ys[k]]) >= -g.pas / 2) travail.push(k);
  const facteur = demi ? 0.5 : 1;

  const poserUn = (p: PlanteAPlacer, pos: Pt): number => {
    if (demi) return etat.poserSymetrique(p, pos, r);
    if (!etat.valide(p, pos)) return 0;
    etat.poser(p, pos);
    return 1;
  };

  // Tirage d'une cellule de travail, pondéré par la proximité à une profondeur cible
  const tirerCellule = (cible: number | null, sigma: number, parmi: number[] = travail): number => {
    for (let essai = 0; essai < 200; essai++) {
      const k = parmi[Math.floor(alea() * parmi.length)];
      if (cible === null) return k;
      const ds = g.s[k] - cible;
      if (alea() < Math.exp(-(ds * ds) / (2 * sigma * sigma))) return k;
    }
    return parmi[Math.floor(alea() * parmi.length)];
  };

  // 1. Sujets à nombre fixe (structure, ponctuation), du plus grand au plus petit
  const fixes = params.plantes.filter((p) => p.nombre !== null).sort((a, b) => b.rayon - a.rayon || a.cle.localeCompare(b.cle));
  for (const p of fixes) {
    const n = quantites.get(p.cle) ?? 0;
    if (geometrique && p.role === "structure") {
      compter(p, placerTrame(p, n, cibles.get(p.cle) ?? 0.5, r, etat));
      continue;
    }
    let restant = n;
    const memes: Pt[] = [];
    for (let tour = 0; restant > 0 && tour < n * 3; tour++) {
      // Meilleur candidat : le plus éloigné des sujets de la même espèce
      let meilleur: Pt | null = null, score = -Infinity;
      for (let c = 0; c < 30; c++) {
        const k = tirerCellule(cibles.get(p.cle) ?? 0.5, 0.18);
        let pos: Pt = [g.xs[k], g.ys[k]];
        // Symétrie et nombre impair : le dernier sujet va sur l'axe
        if (demi && restant === 1) { const l = lateral(r, pos); pos = [pos[0] - l * r.v[0], pos[1] - l * r.v[1]]; }
        if (!etat.valide(p, pos)) continue;
        const d = memes.reduce((m, q) => Math.min(m, Math.hypot(q[0] - pos[0], q[1] - pos[1])), Infinity);
        if (d > score) { score = d; meilleur = pos; }
      }
      if (!meilleur) continue;
      const n2 = poserUn(p, meilleur);
      if (n2 > 0) {
        memes.push(meilleur);
        if (n2 === 2) memes.push(symetrique(r, meilleur));
        restant -= n2;
        compter(p, n2);
      }
    }
  }

  // 2. Taches : chaque espèce à surface reçoit une tache par répétition
  const libres = params.plantes.filter((p) => p.nombre === null && (quantites.get(p.cle) ?? 0) > 0)
    .sort((a, b) => b.hauteur - a.hauteur || a.cle.localeCompare(b.cle));
  interface Tache { plante: PlanteAPlacer; pos: Pt; capacite: number; poids: number; cible: number | null; lambda: number }
  interface Creneau { plante: PlanteAPlacer; capacite: number; cible: number | null; tri: number }
  const creneaux: Creneau[] = [];
  for (const p of libres) {
    const n = Math.max(1, Math.round((quantites.get(p.cle) ?? 0) * facteur));
    // Répétitions demandées, et assez de taches pour garder des groupes de taille raisonnable
    const m = Math.max(1, Math.min(n, Math.max(p.repetitions, Math.round(n / (2 * Math.max(1, p.tailleGroupe))))));
    const surface = n * surfaceParPlante(p.rayon, coef);
    const cible = cibles.get(p.cle) ?? null;
    for (let i = 0; i < m; i++) {
      // Couvre-sol : taches réparties sur toute la profondeur
      const tri = (cible ?? (i + 0.5) / m) + (alea() - 0.5) * 0.1;
      creneaux.push({ plante: p, capacite: surface / m, cible, tri });
    }
  }
  creneaux.sort((a, b) => a.tri - b.tri);

  // Germes répartis uniformément sur la surface (meilleur candidat), triés du fond au devant
  const germes: number[] = [];
  for (let i = 0; i < creneaux.length; i++) {
    let meilleur = travail[Math.floor(alea() * travail.length)], score = -Infinity;
    for (let c = 0; c < 20; c++) {
      const k = travail[Math.floor(alea() * travail.length)];
      const d = germes.reduce((mm, q) => Math.min(mm, Math.hypot(g.xs[q] - g.xs[k], g.ys[q] - g.ys[k])), Infinity);
      if (d > score) { score = d; meilleur = k; }
    }
    germes.push(meilleur);
  }
  germes.sort((a, b) => g.s[a] - g.s[b] || a - b);

  // Rang de profondeur du germe ↔ rang de profondeur cible de l'espèce (gradient continu),
  // puis échanges entre rangs proches pour que deux taches voisines ne soient pas de la même
  // espèce (répétitions séparées ; la bordure peut rester continue)
  const espece = creneaux.map((c) => c);
  const voisins = germes.map((a, i) => germes
    .map((b, j) => ({ j, d: Math.hypot(g.xs[a] - g.xs[b], g.ys[a] - g.ys[b]) }))
    .filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 4).map((x) => x.j));
  const conflitsDe = (i: number, c: Creneau) =>
    c.plante.role === "bordure" ? 0 : voisins[i].filter((j) => espece[j].plante === c.plante).length;
  for (let passe = 0; passe < 6; passe++) {
    let change = false;
    for (let i = 0; i < espece.length; i++) {
      if (conflitsDe(i, espece[i]) === 0) continue;
      let meilleur = -1, gain = 0;
      for (let k = Math.max(0, i - 5); k <= Math.min(espece.length - 1, i + 5); k++) {
        if (k === i || espece[k].plante === espece[i].plante) continue;
        const avant = conflitsDe(i, espece[i]) + conflitsDe(k, espece[k]);
        const apres = conflitsDe(i, espece[k]) + conflitsDe(k, espece[i]);
        if (avant - apres > gain) { gain = avant - apres; meilleur = k; }
      }
      if (meilleur >= 0) { [espece[i], espece[meilleur]] = [espece[meilleur], espece[i]]; change = true; }
    }
    if (!change) break;
  }
  const taches: Tache[] = germes.map((k, i) => ({
    plante: espece[i].plante, pos: [g.xs[k], g.ys[k]] as Pt, capacite: espece[i].capacite, poids: 0, cible: espece[i].cible,
    lambda: espece[i].plante.role === "bordure" ? LAMBDA_BORDURE : espece[i].cible === null ? 0 : LAMBDA_PROFONDEUR,
  }));

  // Attribution des cellules aux taches (diagramme de puissance à capacités)
  const attribution = new Int32Array(nCellules).fill(-1);
  if (taches.length > 0) {
    const totalCapacite = taches.reduce((s, t) => s + t.capacite, 0);
    const surfaceTravail = travail.length * aireCellule;
    for (const t of taches) t.capacite *= surfaceTravail / Math.max(1e-9, totalCapacite);
    // Distances à l'échelle d'une tache : la profondeur oriente sans faire de bandes
    const echelle = Math.sqrt(surfaceTravail / taches.length);
    const ITERATIONS = 60;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const k of travail) {
        let best = 0, bestCout = Infinity;
        for (let j = 0; j < taches.length; j++) {
          const t = taches[j];
          const dx = (g.xs[k] - t.pos[0]) / echelle, dy = (g.ys[k] - t.pos[1]) / echelle;
          const ds = t.cible === null ? 0 : g.s[k] - t.cible;
          const cout = dx * dx + dy * dy + t.lambda * ds * ds - t.poids;
          if (cout < bestCout) { bestCout = cout; best = j; }
        }
        attribution[k] = best;
      }
      const aires = new Float64Array(taches.length), sx = new Float64Array(taches.length), sy = new Float64Array(taches.length);
      for (const k of travail) { const j = attribution[k]; aires[j] += aireCellule; sx[j] += g.xs[k]; sy[j] += g.ys[k]; }
      const pasPoids = 0.15 * (1 - iter / ITERATIONS);
      taches.forEach((t, j) => {
        t.poids += pasPoids * (t.capacite - aires[j]) / Math.max(1e-9, t.capacite);
        if (aires[j] > 0) t.pos = [sx[j] / (aires[j] / aireCellule), sy[j] / (aires[j] / aireCellule)];
      });
    }
  }

  // 3. Dans chaque tache : Poisson (meilleur candidat) puis relaxation de Lloyd
  const candidats: { plante: PlanteAPlacer; pos: Pt; tache: number }[] = [];
  taches.forEach((t, j) => {
    const cellules = travail.filter((k) => attribution[k] === j);
    if (cellules.length === 0) return;
    const n = Math.max(1, Math.round((cellules.length * aireCellule) / surfaceParPlante(t.plante.rayon, coef)));
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      let meilleur: Pt = [g.xs[cellules[0]], g.ys[cellules[0]]], score = -Infinity;
      for (let c = 0; c < 15; c++) {
        const k = cellules[Math.floor(alea() * cellules.length)];
        const d = pts.reduce((m, q) => Math.min(m, Math.hypot(q[0] - g.xs[k], q[1] - g.ys[k])), Infinity);
        if (d > score) { score = d; meilleur = [g.xs[k], g.ys[k]]; }
      }
      pts.push(meilleur);
    }
    for (let iter = 0; iter < 12; iter++) {
      const sx = new Float64Array(n), sy = new Float64Array(n), nb = new Float64Array(n);
      for (const k of cellules) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i++) {
          const d = (pts[i][0] - g.xs[k]) ** 2 + (pts[i][1] - g.ys[k]) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        sx[best] += g.xs[k]; sy[best] += g.ys[k]; nb[best]++;
      }
      for (let i = 0; i < n; i++) {
        if (nb[i] === 0) continue;
        const c: Pt = [sx[i] / nb[i], sy[i] / nb[i]];
        // Centroïde hors de la tache (contour concave) : ramené sur la cellule la plus proche
        const k = celluleDe(g, c);
        pts[i] = k >= 0 && attribution[k] === j ? c : plusProche(g, cellules, c);
      }
    }
    for (const pos of pts) candidats.push({ plante: t.plante, pos, tache: j });
  });

  // Pose : les plus larges d'abord ; position invalide → cellule voisine de la même tache
  candidats.sort((a, b) => b.plante.rayon - a.plante.rayon || a.plante.cle.localeCompare(b.plante.cle));
  for (const c of candidats) {
    let n = poserUn(c.plante, c.pos);
    if (n === 0) {
      const portee = c.plante.rayon * coef;
      const voisines: number[] = [];
      cellulesDansDisque(g, c.pos, portee, (k) => { if (attribution[k] === c.tache) voisines.push(k); });
      voisines.sort((a, b) => Math.hypot(g.xs[a] - c.pos[0], g.ys[a] - c.pos[1]) - Math.hypot(g.xs[b] - c.pos[0], g.ys[b] - c.pos[1]));
      for (const k of voisines) {
        n = poserUn(c.plante, [g.xs[k], g.ys[k]]);
        if (n > 0) break;
      }
    }
    compter(c.plante, n);
  }

  // 4. Comblement des vides jusqu'à la couverture visée
  const cible = COUVERTURE_CIBLE[densite];
  const essayees = new Uint8Array(nCellules);
  const plusPetites = [...libres].sort((a, b) =>
    Number(b.role === "couvre_sol") - Number(a.role === "couvre_sol") || a.rayon - b.rayon || a.cle.localeCompare(b.cle));
  // Champ de distance de chaque cellule au bord de la couronne la plus proche
  const eloignement = new Float64Array(nCellules).fill(Infinity);
  let vus = 0;
  const majEloignement = () => {
    for (; vus < etat.voisines.length; vus++) {
      const v = etat.voisines[vus];
      for (const k of travail) {
        const d = Math.hypot(v.position[0] - g.xs[k], v.position[1] - g.ys[k]) - v.rayon;
        if (d < eloignement[k]) eloignement[k] = d;
      }
    }
  };
  for (let iter = 0; iter < 3000 && etat.couverture() < cible; iter++) {
    majEloignement();
    // Vide le plus profond : cellule non couverte la plus éloignée de toute couronne
    let trou = -1, dTrou = -Infinity;
    for (const k of travail) {
      if (etat.couvert[k] || essayees[k]) continue;
      if (eloignement[k] > dTrou) { dTrou = eloignement[k]; trou = k; }
    }
    if (trou < 0) break;
    essayees[trou] = 1;
    const pos: Pt = [g.xs[trou], g.ys[trou]];
    const locale = attribution[trou] >= 0 ? taches[attribution[trou]].plante : null;
    const ordre = locale ? [locale, ...plusPetites.filter((p) => p !== locale)] : plusPetites;
    for (const p of ordre) {
      const n = poserUn(p, pos);
      if (n > 0) { compter(p, n); break; }
    }
  }

  // Écarts : nombre fixe non atteint ; pour les espèces à surface, seulement si la
  // couverture visée n'est pas atteinte (sinon d'autres plantes ont comblé la place)
  const ecarts: EcartQuantite[] = [];
  const couvertureAtteinte = etat.couverture() >= cible;
  for (const [cle, demande] of quantites) {
    const place = poses.get(cle) ?? 0;
    const p = parCle.get(cle)!;
    if (place >= demande) continue;
    if (p.nombre !== null || (!couvertureAtteinte && place < Math.floor(demande * 0.8))) ecarts.push({ cle, demande, place });
  }

  return {
    placements: etat.placements,
    ecarts,
    quantites: Object.fromEntries(quantites),
    surfacePlantable: Math.round(surfacePlantable * 10) / 10,
    couverture: etat.couverture(),
  };
}

function plusProche(g: Grille, cellules: number[], c: Pt): Pt {
  let best = cellules[0], bd = Infinity;
  for (const k of cellules) {
    const d = (g.xs[k] - c[0]) ** 2 + (g.ys[k] - c[1]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return [g.xs[best], g.ys[best]];
}

/** Sujets de structure (mode géométrique) : alignement régulier et symétrique sur une ligne. */
function placerTrame(p: PlanteAPlacer, n: number, cible: number, r: Repere, etat: Etat): number {
  const lignes = [cible, Math.max(0.05, cible - 0.12), Math.min(0.95, cible + 0.12)];
  for (const s of lignes) {
    for (let k = n; k >= 1; k--) {
      const marge = Math.max(p.rayon, 0.4);
      const portee = (r.lMax - r.lMin) / 2 - marge;
      if (portee < 0) continue;
      const pas = k > 1 ? (2 * portee) / (k - 1) : 0;
      const positions: Pt[] = [];
      for (let i = 0; i < k; i++) positions.push(versPlan(r, s, k > 1 ? -portee + i * pas : 0));
      if (positionsValides(p, positions, etat)) {
        for (const pos of positions) etat.poser(p, pos);
        return k;
      }
    }
  }
  return 0;
}

function positionsValides(p: PlanteAPlacer, positions: Pt[], etat: Etat): boolean {
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
