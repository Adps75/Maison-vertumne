import { z } from "zod";

/** Liste blanche des champs modifiables par le visiteur via PATCH. */
export const schemaLeadPatch = z
  .object({
    prenom: z.string().optional(),
    email: z.string().email().optional(),
    telephone: z.string().optional(),

    adresse_label: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    code_insee: z.string().optional(),
    parcelle_geojson: z.record(z.string(), z.unknown()).nullable().optional(),
    surface_parcelle: z.number().optional(),

    type_lieu: z.enum(["maison", "appartement"]).optional(),
    type_espace: z.enum(["balcon", "terrasse", "toit_terrasse"]).optional(),
    surface_espace: z.number().optional(),
    etage: z.number().int().min(0).optional(),
    acces: z.enum(["ascenseur", "escalier", "monte_charge", "exterieur"]).optional(),
    orientation_espace: z
      .enum([
        "nord", "nord_est", "est", "sud_est",
        "sud", "sud_ouest", "ouest", "nord_ouest",
        "ne_sait_pas",
      ])
      .optional(),
    accord_copro: z.enum(["obtenu", "a_demander", "non_necessaire", "ne_sait_pas"]).optional(),

    types_amenagement: z.array(z.string()).optional(),
    surface_projet: z.number().nullable().optional(),
    tranche_surface: z.string().optional(),
    description: z.string().optional(),
    budget_declare: z.enum(["moins_5k", "5k_15k", "15k_40k", "plus_40k", "ne_sait_pas"]).optional(),
    urgence: z.enum(["moins_3_mois", "3_6_mois", "6_12_mois", "plus_12_mois"]).optional(),
    proprietaire: z.boolean().optional(),
    rappel_souhaite: z.boolean().optional(),
    creneau_rappel: z.string().optional(),

    etape_atteinte: z.number().int().min(1).optional(),
    image_aerienne_path: z.string().optional(),
  })
  .strict();

export type LeadPatchInput = z.infer<typeof schemaLeadPatch>;
