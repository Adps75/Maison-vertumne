import { z } from "zod";

export const schemaObservations = z.object({
  synthese_demande: z.string(),
  existant: z.array(z.string()),
  etat_vegetation: z.string(),
  contraintes_visibles: z.array(z.string()),
  orientation_jardin: z.string(),
  pistes_amenagement: z
    .array(
      z.object({
        titre: z.string(),
        description: z.string(),
      }),
    )
    .min(2)
    .max(3),
  niveau_confiance: z.enum(["faible", "moyen", "eleve"]),
});

export const schemaFicheInterne = z.object({
  perimetre_reel: z.object({
    valeur: z.enum(["ponctuel", "partiel", "complet"]),
    confiance: z.enum(["faible", "moyen", "eleve"]),
  }),
  coherence_estimation: z.object({
    valeur: z.enum([
      "coherente",
      "probablement_sous_evaluee",
      "probablement_sur_evaluee",
    ]),
    explication: z.string(),
  }),
  acces: z.object({
    valeur: z.enum(["facile", "passage_etroit", "par_la_maison", "inconnu"]),
    confiance: z.enum(["faible", "moyen", "eleve"]),
    indices: z.string(),
  }),
  niveau_gamme_apparent: z.enum(["standard", "soigne", "haut_de_gamme"]),
  signaux_interet: z.array(z.string()),
  points_vigilance: z.array(z.string()),
  questions_appel: z.array(z.string()).min(3).max(5),
});

export const schemaAnalyseIA = z.object({
  observations: schemaObservations,
  fiche_interne: schemaFicheInterne,
});

export type AnalyseIA = z.infer<typeof schemaAnalyseIA>;
export type Observations = z.infer<typeof schemaObservations>;
export type FicheInterne = z.infer<typeof schemaFicheInterne>;
