/**
 * Composition IA — contrôles déterministes et coût, sans dépendance serveur (testables).
 */

import type { Palette, Intention, Role } from "./schemas";
import { lireCase, etiquette, type Grille } from "./grille";
import { NATURES_SURFACES, NATURES_VEGETALES, type Analyse, type FormeExistant, type NatureExistant, type Recommandation } from "./schemas";

export interface PlanteBibliotheque {
  id: string;
  nom_latin: string;
  nom_commun: string;
  categorie: string;
  hauteur_adulte_m: number | null;
  largeur_adulte_m: number | null;
  largeur_3ans_m: number | null;
  forme: string | null;
  feuillage: string | null;
  couleur_floraison: string | null;
  periode_floraison: string | null;
  exposition: string[] | null;
  besoin_eau: string | null;
  resistance_secheresse: string | null;
}

/** Tarifs Anthropic en $ par million de jetons (entrée, sortie). */
const TARIFS: [RegExp, number, number][] = [
  [/^claude-(fable|mythos)-5-2/, 8, 40],
  [/^claude-(fable|mythos)-5(-1)?$/, 10, 50],
  [/^claude-opus-5-5/, 4, 20],
  [/^claude-opus-(5|4-[5-9])/, 5, 25],
  [/^claude-sonnet-5/, 2, 10],
  [/^claude-sonnet-4/, 3, 15],
  [/^claude-haiku-5-5/, 0.1, 0.5],
  [/^claude-haiku-4/, 1, 5],
];
const USD_VERS_EUR = 0.92;

/** Coût réel en euros depuis la consommation renvoyée par l'API (0 si modèle inconnu). */
export function coutAnthropic(modele: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const tarif = TARIFS.find(([re]) => re.test(modele));
  if (!tarif) {
    console.warn(`[composition] tarif inconnu pour ${modele} : coût enregistré à 0`);
    return 0;
  }
  const [, entree, sortie] = tarif;
  const jetonsEntree = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  const usd = (jetonsEntree * entree + usage.output_tokens * sortie) / 1_000_000;
  return Math.round(usd * USD_VERS_EUR * 10000) / 10000;
}

/**
 * Contrôles déterministes après validation : identifiants inconnus retirés,
 * ajout déjà présent dans la bibliothèque converti en plante retenue.
 */
export function nettoyerPalette(p: Palette, bibliotheque: PlanteBibliotheque[]): Palette {
  const ids = new Set(bibliotheque.map((b) => b.id));
  const parNom = new Map(bibliotheque.map((b) => [b.nom_latin.trim().toLowerCase(), b.id]));
  const retenues = p.retenues.filter((r) => ids.has(r.plante_id));
  const remarques = [p.remarques];
  const inconnues = p.retenues.length - retenues.length;
  if (inconnues > 0) remarques.push(`${inconnues} plante(s) proposée(s) hors bibliothèque ignorée(s).`);
  const ajouts = [];
  for (const a of p.ajouts) {
    const existant = parNom.get(a.nom_latin.trim().toLowerCase());
    if (existant) {
      if (!retenues.some((r) => r.plante_id === existant)) retenues.push({ plante_id: existant, raison: a.raison });
    } else ajouts.push(a);
  }
  return { retenues, ajouts, remarques: remarques.filter(Boolean).join(" ") };
}

// ─── Intention ─────────────────────────────────────────────────────────

const ROLES_FIXES: Role[] = ["structure", "ponctuation"];

/**
 * Intention contrôlée : plantes hors palette retirées ; structure et ponctuation en nombre
 * fixe (au moins 1, sans part) ; autres rôles en part de surface (au moins 0, sans nombre),
 * parts ramenées à 100 % (réparties également si aucune n'est donnée) ; répétitions ≥ 1.
 */
export function nettoyerIntention(i: Intention, idsPalette: string[]): Intention {
  const ids = new Set(idsPalette);
  const plantes = i.plantes.filter((p) => ids.has(p.plante_id)).map((p) => {
    const fixe = ROLES_FIXES.includes(p.role);
    return {
      ...p,
      nombre: fixe ? Math.max(1, Math.round(p.nombre ?? 1)) : null,
      part_surface: fixe ? null : Math.max(0, p.part_surface ?? 0),
      taille_groupe: Math.max(1, Math.round(p.taille_groupe)),
      repetitions: Math.max(1, Math.round(p.repetitions)),
    };
  });
  const libres = plantes.filter((p) => p.part_surface !== null);
  const somme = libres.reduce((s, p) => s + (p.part_surface ?? 0), 0);
  for (const p of libres) {
    p.part_surface = Math.round((somme > 0 ? (p.part_surface! / somme) * 100 : 100 / libres.length) * 10) / 10;
  }
  return { ...i, plantes };
}

// ─── Analyse ───────────────────────────────────────────────────────────


/** Forme proposée par défaut pour un végétal existant, d'après sa nature. */
export const FORME_PAR_NATURE: Partial<Record<NatureExistant, FormeExistant>> = {
  arbre: "arbre", haie: "haie", topiaire: "cone", arbuste: "boule", massif: "boule",
  graminee: "boule", couvre_sol: "boule", grimpante: "colonne",
};

/**
 * Règles fixes sur un élément de l'analyse : une surface (pelouse, sol nu, gravier) est
 * toujours « remplacer » et sans forme ; un objet n'est jamais « remplacer » (→ à évaluer) ;
 * un végétal reçoit une forme par défaut, un objet non végétal n'en a pas.
 */
export function normaliserExistant<T extends { nature: NatureExistant; recommandation: Recommandation; forme?: FormeExistant | null }>(e: T): T {
  if (NATURES_SURFACES.includes(e.nature)) return { ...e, recommandation: "remplacer", forme: null };
  const recommandation: Recommandation = e.recommandation === "remplacer" ? "a_evaluer" : e.recommandation;
  const forme = NATURES_VEGETALES.includes(e.nature) ? (e.forme ?? FORME_PAR_NATURE[e.nature] ?? "boule") : null;
  return { ...e, recommandation, forme };
}

/** Normalise les cases (« c4 » → « C4 ») et écarte celles hors grille ; un élément sans case valide est retiré. */
export function nettoyerAnalyse(a: Analyse, g: Grille): Analyse {
  const cases = (liste: string[]) => {
    const sortie: string[] = [];
    for (const c of liste) {
      const lu = lireCase(g, c);
      if (!lu) continue;
      const e = etiquette(lu.colonne, lu.ligne);
      if (!sortie.includes(e)) sortie.push(e);
    }
    return sortie;
  };
  const existants = a.existants
    .map((e) => normaliserExistant({ ...e, cases: cases(e.cases) }) as Analyse["existants"][number])
    .filter((e) => e.cases.length > 0);
  const retires = a.existants.length - existants.length;
  const zones = (z: { cases: string[]; description: string }[]) => z.map((x) => ({ ...x, cases: cases(x.cases) })).filter((x) => x.cases.length > 0);
  return {
    ...a,
    existants,
    ombre_lumiere: { ombre: zones(a.ombre_lumiere.ombre), lumiere: zones(a.ombre_lumiere.lumiere) },
    remarques: retires > 0 ? `${a.remarques} ${retires} élément(s) sans case valide ignoré(s).`.trim() : a.remarques,
  };
}
