import { SCORE_CONFIG } from "@/config/score";
import { haversine } from "@/lib/geo";
import { ZONE } from "@/config/zone";
import type { AnalyseIA } from "@/lib/validation/analyse";

export interface LeadPourScore {
  fourchette_max: number | null;
  fourchette_min: number | null;
  lat: number | null;
  lon: number | null;
  proprietaire: boolean | null;
  urgence: string | null;
  budget_declare: string | null;
  rappel_souhaite: boolean | null;
  description: string | null;
  types_amenagement: string[] | null;
  nb_photos: number;
}

export interface DetailScore {
  [critere: string]: number;
}

export interface ResultatScore {
  fiabilite: number;
  interet: number;
  total: number;
  categorie: "A" | "B" | "C" | "D";
  detail: DetailScore;
}

/**
 * Score unique sur 100, centré sur la probabilité de signer.
 * Fiabilité (sur 60) + Intérêt (sur 40).
 * L'IA observe et signale ; le score est calculé par des règles fixes.
 */
export function calculerScore(
  lead: LeadPourScore,
  analyse: AnalyseIA | null,
): ResultatScore {
  const cfg = SCORE_CONFIG;
  const detail: DetailScore = {};

  // ===================== FIABILITÉ (sur 60) =====================

  // Propriétaire
  const ptsProprio = lead.proprietaire
    ? cfg.fiabilite.proprietaire.oui
    : cfg.fiabilite.proprietaire.non;
  detail.proprietaire = ptsProprio;

  // Délai
  const ptsDelai = lead.urgence
    ? (cfg.fiabilite.delai[lead.urgence] ?? 0)
    : 0;
  detail.delai = ptsDelai;

  // Budget cohérent
  const ptsBudget = evaluerCoherenceBudget(lead);
  detail.budget_coherent = ptsBudget;

  // Engagement (rappel ou diagnostic demandé)
  const ptsEngagement = lead.rappel_souhaite
    ? cfg.fiabilite.engagement
    : 0;
  detail.engagement = ptsEngagement;

  // Dossier complet
  const descLong =
    (lead.description?.length ?? 0) >= cfg.fiabilite.dossier_complet.min_description;
  const assezPhotos =
    lead.nb_photos >= cfg.fiabilite.dossier_complet.min_photos;
  const ptsDossier = descLong && assezPhotos
    ? cfg.fiabilite.dossier_complet.points
    : 0;
  detail.dossier_complet = ptsDossier;

  const fiabilite = ptsProprio + ptsDelai + ptsBudget + ptsEngagement + ptsDossier;

  // ===================== INTÉRÊT (sur 40) =====================

  // Montant
  const fmax = lead.fourchette_max ?? 0;
  let ptsMontant = 0;
  for (const t of cfg.interet.montant) {
    if (fmax <= t.seuil) {
      ptsMontant = t.points;
      break;
    }
  }
  detail.montant = ptsMontant;

  // Distance
  let ptsDistance = 0;
  if (lead.lat != null && lead.lon != null) {
    const dist = haversine(ZONE.centre, { lat: lead.lat, lon: lead.lon });
    if (dist <= cfg.interet.distance.proche.seuil_km) {
      ptsDistance = cfg.interet.distance.proche.points;
    } else if (dist <= cfg.interet.distance.moyen.seuil_km) {
      ptsDistance = cfg.interet.distance.moyen.points;
    } else {
      ptsDistance = cfg.interet.distance.loin;
    }
  }
  detail.distance = ptsDistance;

  // Projet clair
  let ptsProjetClair = 0;
  if (analyse) {
    const confPerimetre = analyse.fiche_interne.perimetre_reel.confiance;
    if (confPerimetre === "moyen" || confPerimetre === "eleve") {
      ptsProjetClair += cfg.interet.projet_clair.perimetre_confiance;
    }
    if (analyse.fiche_interne.coherence_estimation.valeur === "coherente") {
      ptsProjetClair += cfg.interet.projet_clair.estimation_coherente;
    }
  }
  detail.projet_clair = ptsProjetClair;

  // Potentiel
  let ptsPotentiel = 0;
  if (analyse) {
    const gamme = analyse.fiche_interne.niveau_gamme_apparent;
    if (gamme === "soigne" || gamme === "haut_de_gamme") {
      ptsPotentiel += cfg.interet.potentiel.gamme_elevee;
    }

    // Périmètre réel plus large que les prestations choisies, ou signal d'extension
    const perimetreIA = analyse.fiche_interne.perimetre_reel;
    const prestations = lead.types_amenagement ?? [];
    const perimetrePrestations = prestations.includes("creation_complete")
      ? "complet"
      : prestations.length >= 3
        ? "partiel"
        : "ponctuel";

    const niveaux = { ponctuel: 0, partiel: 1, complet: 2 };
    const iaPlus =
      (confPerimetreOk(perimetreIA.confiance)) &&
      (niveaux[perimetreIA.valeur] ?? 0) > (niveaux[perimetrePrestations] ?? 0);

    const signalExtension = analyse.fiche_interne.signaux_interet.some(
      (s) =>
        s.toLowerCase().includes("entretien") ||
        s.toLowerCase().includes("extension") ||
        s.toLowerCase().includes("potentiel"),
    );

    if (iaPlus || signalExtension) {
      ptsPotentiel += cfg.interet.potentiel.perimetre_plus_large_ou_extension;
    }
  }
  detail.potentiel = ptsPotentiel;

  const interet = ptsMontant + ptsDistance + ptsProjetClair + ptsPotentiel;

  // ===================== TOTAL & CATÉGORIE =====================

  const total = fiabilite + interet;

  let categorie: "A" | "B" | "C" | "D";
  if (total >= cfg.categories.A) categorie = "A";
  else if (total >= cfg.categories.B) categorie = "B";
  else if (total >= cfg.categories.C) categorie = "C";
  else categorie = "D";

  return { fiabilite, interet, total, categorie, detail };
}

function confPerimetreOk(confiance: string): boolean {
  return confiance === "moyen" || confiance === "eleve";
}

function evaluerCoherenceBudget(lead: LeadPourScore): number {
  const cfg = SCORE_CONFIG.fiabilite;

  if (!lead.budget_declare || lead.budget_declare === "ne_sait_pas") {
    return cfg.budget_ne_sait_pas;
  }

  if (lead.fourchette_min == null || lead.fourchette_max == null) {
    return cfg.budget_ne_sait_pas;
  }

  const budgetRanges: Record<string, [number, number]> = {
    moins_5k: [0, 5000],
    "5k_15k": [5000, 15000],
    "15k_40k": [15000, 40000],
    plus_40k: [40000, Infinity],
  };

  const range = budgetRanges[lead.budget_declare];
  if (!range) return cfg.budget_ne_sait_pas;

  const chevauchement =
    lead.fourchette_min <= range[1] && lead.fourchette_max >= range[0];

  return chevauchement ? cfg.budget_coherent : cfg.budget_incoherent;
}
