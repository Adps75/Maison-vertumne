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

// ─── Analyse des vues photo calées (sortie de l'IA, avant la palette) ─────

export const NATURES_EXISTANT = [
  "arbre", "arbuste", "topiaire", "haie", "massif", "graminee", "couvre_sol", "grimpante",
  "pelouse", "statue", "mur", "bordure", "dallage", "mobilier", "autre",
] as const;
export type NatureExistant = (typeof NATURES_EXISTANT)[number];

/** Natures végétales (pouvant être ajoutées au plan comme végétal existant). */
export const NATURES_VEGETALES: NatureExistant[] = ["arbre", "arbuste", "topiaire", "haie", "massif", "graminee", "couvre_sol", "grimpante"];

export const schemaElementExistant = z.object({
  nature: z.enum(NATURES_EXISTANT),
  description: z.string().describe("Ce que l'on voit, en quelques mots"),
  espece_probable: z.string().nullable().describe("Nom latin et nom commun probables, ou null si non identifiable"),
  confiance: z.enum(["faible", "moyenne", "elevee"]),
  cases: z.array(z.string()).describe("Cases de la grille occupées (ex. « C4 »), d'après le plan et les photos"),
  hauteur_estimee_m: z.number().nullable(),
  recommandation: z.enum(["conserver", "a_evaluer"]),
});
export type ElementExistant = z.infer<typeof schemaElementExistant>;

const schemaZoneLumiere = z.object({ cases: z.array(z.string()), description: z.string() });

export const schemaAnalyse = z.object({
  existants: z.array(schemaElementExistant),
  style_existant: z.string().describe("Style du jardin existant"),
  ambiance: z.string(),
  ombre_lumiere: z.object({
    ombre: z.array(schemaZoneLumiere).describe("Zones d'ombre observées sur les photos"),
    lumiere: z.array(schemaZoneLumiere).describe("Zones ensoleillées observées sur les photos"),
  }),
  premier_plan: z.string().describe("Ce qui se voit en premier plan depuis la vue principale"),
  fond: z.string().describe("Ce qui se voit en fond depuis la vue principale"),
  remarques: z.string().describe("Incertitudes, éléments non visibles, limites de l'analyse"),
});
export type Analyse = z.infer<typeof schemaAnalyse>;

/** Analyse validée par le paysagiste : existant corrigé, chaque élément peut être ajouté au plan. */
export const schemaAnalyseValidee = schemaAnalyse.extend({
  existants: z.array(schemaElementExistant.extend({
    ajouterAuPlan: z.boolean(),
  })),
});
export type AnalyseValidee = z.infer<typeof schemaAnalyseValidee>;

export const schemaGrille = z.object({
  xMin: z.number(), yMax: z.number(), pas: z.number().positive(),
  colonnes: z.number().int().positive().max(200), lignes: z.number().int().positive().max(200),
});

/** Image JPEG en base64 (sans préfixe data:), 3 Mo au plus. */
const imageBase64 = z.string().min(100).max(4_000_000).regex(/^[A-Za-z0-9+/=]+$/);

export const schemaDemandeAnalyse = z.object({
  zoneId: z.string().min(1),
  brief: schemaBrief,
  contexte: schemaContexte,
  empreinte: z.string().min(8).max(64),
  grille: schemaGrille,
  casesMassif: z.array(z.string()).max(2000),
  refaire: z.boolean(),
  images: z.object({
    plan: imageBase64,
    vues: z.array(z.object({ nom: z.string().max(120), principale: z.boolean(), image: imageBase64 })).min(1).max(2),
  }).nullable(),
});
export type DemandeAnalyse = z.infer<typeof schemaDemandeAnalyse>;
