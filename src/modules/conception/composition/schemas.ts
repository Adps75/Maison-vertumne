/**
 * Composition automatique d'un massif — schémas (Zod).
 *
 * L'IA fait les choix de paysagiste (palette, rôles, quantités, profondeur, groupes,
 * structure) ; un algorithme déterministe place les plantes. Aucun schéma de sortie
 * de l'IA ne contient de coordonnées.
 */

import { z } from "zod";

// ─── Brief (saisi par le paysagiste) ─────────────────────────────────────

export const STYLES = [
  "francaise", "mixed_border", "naturel_graminees", "mediterraneen_sec",
  "contemporain_structure", "champetre", "japonisant", "autre",
] as const;

export const LIBELLES_STYLES: Record<(typeof STYLES)[number], string> = {
  francaise: "Jardin à la française",
  mixed_border: "Mixed border",
  naturel_graminees: "Naturel et graminées",
  mediterraneen_sec: "Méditerranéen sec",
  contemporain_structure: "Contemporain structuré",
  champetre: "Champêtre",
  japonisant: "Japonisant",
  autre: "Autre",
};

export const SAISONS = ["printemps", "ete", "automne", "hiver"] as const;

export const CONTEXTE_CLIMATIQUE_DEFAUT =
  "Île-de-France : étés de plus en plus chauds et secs, épisodes de sécheresse estivale fréquents, hivers doux avec gelées ponctuelles.";

export const schemaBrief = z.object({
  description: z.string().max(4000),
  style: z.enum(STYLES),
  styleAutre: z.string().max(200).optional(),
  structure: z.enum(["geometrique", "libre", "mixte"]),
  couleurs: z.array(z.string().max(40)).max(8),
  saisons: z.array(z.enum(SAISONS)),
  hauteurMin: z.number().min(0).max(30),
  hauteurMax: z.number().min(0).max(30),
  partPersistants: z.number().min(0).max(100),
  entretien: z.enum(["faible", "moyen", "eleve"]),
  densite: z.enum(["serree", "standard", "aeree"]),
  secheresse: z.enum(["normale", "elevee", "tres_elevee"]),
  contexteClimatique: z.string().max(2000),
});
export type Brief = z.infer<typeof schemaBrief>;

// ─── Contexte (calculé automatiquement) ──────────────────────────────────

export const schemaContexte = z.object({
  surface_m2: z.number(),
  longueur_m: z.number(),
  largeur_m: z.number(),
  forme: z.enum(["rectangulaire", "allongee", "circulaire", "irreguliere"]),
  exposition: z.enum(["plein_soleil", "mi_ombre", "ombre"]),
  detailExposition: z.string(),
  pente: z.object({ pourcent: z.number(), descendVers: z.string() }).nullable(),
  devant: z.object({
    source: z.enum(["vue", "facade", "defaut"]),
    description: z.string(),
  }),
  plantesExistantes: z.array(z.object({
    nom_latin: z.string(),
    nom_commun: z.string(),
    dansMassif: z.boolean(),
    distance_m: z.number(),
  })),
  vues: z.array(z.object({ nom: z.string(), principale: z.boolean() })),
});
export type Contexte = z.infer<typeof schemaContexte>;

// ─── Palette (sortie de l'IA, appel 1) ───────────────────────────────────

export const CATEGORIES = ["arbre", "arbuste", "vivace", "graminee", "couvre_sol", "grimpante"] as const;
export const FORMES = ["boule", "colonne", "etalee", "retombante", "touffe", "tige"] as const;
export const EXPOSITIONS = ["soleil", "mi_ombre", "ombre"] as const;

export const schemaFichePlante = z.object({
  nom_latin: z.string().describe("Nom latin exact (genre, espèce, cultivar entre guillemets simples le cas échéant)"),
  nom_commun: z.string().describe("Nom commun en français"),
  categorie: z.enum(CATEGORIES),
  largeur_adulte_m: z.number(),
  hauteur_adulte_m: z.number(),
  largeur_3ans_m: z.number().describe("Largeur 3 ans après plantation, en mètres"),
  forme: z.enum(FORMES),
  feuillage: z.enum(["persistant", "caduc"]),
  couleur_feuillage: z.string(),
  couleur_floraison: z.string().nullable(),
  periode_floraison: z.string().nullable().describe("Ex. « juin-septembre », ou null"),
  exposition: z.array(z.enum(EXPOSITIONS)),
  besoin_eau: z.enum(["faible", "moyen", "eleve"]),
  resistance_secheresse: z.enum(["normale", "elevee", "tres_elevee"]),
});
export type FichePlante = z.infer<typeof schemaFichePlante>;

export const schemaPalette = z.object({
  retenues: z.array(z.object({
    plante_id: z.string().describe("Identifiant exact d'une plante de la bibliothèque fournie"),
    raison: z.string(),
  })),
  ajouts: z.array(schemaFichePlante.extend({
    raison: z.string(),
    incertitude: z.string().nullable().describe("Doute éventuel (identification, rusticité, disponibilité), sinon null"),
  })),
  remarques: z.string().describe("Remarques générales, incertitudes, limites du brief"),
});
export type Palette = z.infer<typeof schemaPalette>;

// ─── Intention (sortie de l'IA, appel 2) ─────────────────────────────────

export const ROLES = ["structure", "fond", "masse", "ponctuation", "bordure", "couvre_sol"] as const;
export type Role = (typeof ROLES)[number];
export const PROFONDEURS = ["fond", "milieu", "devant"] as const;
export type Profondeur = (typeof PROFONDEURS)[number];

export const schemaIntention = z.object({
  plantes: z.array(z.object({
    plante_id: z.string(),
    quantite: z.number().int(),
    role: z.enum(ROLES),
    profondeur: z.enum(PROFONDEURS),
    taille_groupe: z.number().int().describe("Nombre de sujets par groupe, impair (1, 3, 5, 7…)"),
    repetitions: z.number().int().describe("Nombre de groupes répartis dans le massif"),
  })),
  geometrie: z.object({
    symetrie: z.enum(["aucune", "gauche_droite"]),
    motifs: z.array(z.object({
      plante_id: z.string(),
      disposition: z.enum(["alignement", "encadrement", "quinconce"]),
      description: z.string(),
    })),
  }).nullable().describe("Uniquement pour une structure géométrique, sinon null"),
  explication: z.string().describe("Intention de composition en quelques phrases, pour le client"),
});
export type Intention = z.infer<typeof schemaIntention>;
