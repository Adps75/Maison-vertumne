import { z } from "zod";
import {
  codesMaison,
  codesAppartement,
  TRANCHES_MAISON,
  TRANCHES_APPARTEMENT,
} from "@/config/amenagements";

const codesTrancheMaison = TRANCHES_MAISON.map((t) => t.code);
const codesTrancheAppartement = TRANCHES_APPARTEMENT.map((t) => t.code);

// --- Projet maison ---

export const schemaProjetMaison = z
  .object({
    types_amenagement: z
      .array(z.string())
      .min(1, "Choisissez au moins un type d'aménagement.")
      .refine(
        (codes) => codes.every((c) => codesMaison().includes(c)),
        { message: "Type d'aménagement inconnu." },
      ),
    tranche_surface: z
      .string()
      .refine((c) => codesTrancheMaison.includes(c), {
        message: "Tranche de surface invalide.",
      }),
    description: z
      .string()
      .min(30, "Décrivez votre projet en au moins 30 caractères."),
  })
  .refine(
    (data) => {
      if (data.types_amenagement.includes("creation_complete")) {
        return data.types_amenagement.length === 1;
      }
      return true;
    },
    {
      message:
        "« Création complète » ne peut pas être combiné avec d'autres choix.",
      path: ["types_amenagement"],
    },
  );

// --- Projet appartement ---

export const schemaProjetAppartement = z
  .object({
    types_amenagement: z
      .array(z.string())
      .min(1, "Choisissez au moins un type d'aménagement.")
      .refine(
        (codes) => codes.every((c) => codesAppartement().includes(c)),
        { message: "Type d'aménagement inconnu." },
      ),
    tranche_surface: z
      .string()
      .refine((c) => codesTrancheAppartement.includes(c), {
        message: "Tranche de surface invalide.",
      }),
    description: z
      .string()
      .min(30, "Décrivez votre projet en au moins 30 caractères."),
    type_espace: z.enum(["balcon", "terrasse", "toit_terrasse"], {
      message: "Choisissez un type d'espace.",
    }),
    etage: z.number().int().min(0, "L'étage doit être 0 ou plus."),
    acces: z.enum(["ascenseur", "escalier", "monte_charge", "exterieur"], {
      message: "Choisissez un type d'accès.",
    }),
    orientation_espace: z.enum(
      [
        "nord", "nord_est", "est", "sud_est",
        "sud", "sud_ouest", "ouest", "nord_ouest",
        "ne_sait_pas",
      ],
      { message: "Choisissez une orientation." },
    ),
    accord_copro: z.enum(
      ["obtenu", "a_demander", "non_necessaire", "ne_sait_pas"],
      { message: "Précisez l'état de l'accord de copropriété." },
    ),
  })
  .refine(
    (data) => {
      if (data.types_amenagement.includes("creation_complete")) {
        return data.types_amenagement.length === 1;
      }
      return true;
    },
    {
      message:
        "« Création complète » ne peut pas être combiné avec d'autres choix.",
      path: ["types_amenagement"],
    },
  );

// --- Précisions ---

export const schemaPrecisions = z.object({
  budget_declare: z.enum(
    ["moins_5k", "5k_15k", "15k_40k", "plus_40k", "ne_sait_pas"],
    { message: "Choisissez une tranche de budget." },
  ),
  urgence: z.enum(
    ["moins_3_mois", "3_6_mois", "6_12_mois", "plus_12_mois"],
    { message: "Choisissez un délai." },
  ),
  proprietaire: z.boolean({ message: "Précisez si vous êtes propriétaire." }),
});

export type ProjetMaisonInput = z.input<typeof schemaProjetMaison>;
export type ProjetAppartementInput = z.input<typeof schemaProjetAppartement>;
export type PrecisionsInput = z.input<typeof schemaPrecisions>;
