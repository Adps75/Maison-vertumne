/**
 * Composition IA — contrôles déterministes et coût, sans dépendance serveur (testables).
 */

import type { Palette } from "./schemas";
import { lireCase, etiquette, type Grille } from "./grille";
import type { Analyse } from "./schemas";

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

// ─── Analyse ───────────────────────────────────────────────────────────


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
  const existants = a.existants.map((e) => ({ ...e, cases: cases(e.cases) })).filter((e) => e.cases.length > 0);
  const retires = a.existants.length - existants.length;
  const zones = (z: { cases: string[]; description: string }[]) => z.map((x) => ({ ...x, cases: cases(x.cases) })).filter((x) => x.cases.length > 0);
  return {
    ...a,
    existants,
    ombre_lumiere: { ombre: zones(a.ombre_lumiere.ombre), lumiere: zones(a.ombre_lumiere.lumiere) },
    remarques: retires > 0 ? `${a.remarques} ${retires} élément(s) sans case valide ignoré(s).`.trim() : a.remarques,
  };
}
