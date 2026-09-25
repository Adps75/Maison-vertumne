import { z } from "zod";

export const schemaTarif = z.object({
  type_amenagement: z.string(),
  prix_m2_min: z.coerce.number(),
  prix_m2_max: z.coerce.number(),
  mode: z.enum(["part", "global"]),
  part_defaut: z.coerce.number().nullable(),
  forfait_minimum: z.coerce.number(),
});

export const schemaDegressivite = z.object({
  seuil_bas: z.coerce.number(),
  coeff_bas: z.coerce.number(),
  seuil_haut: z.coerce.number(),
  coeff_haut: z.coerce.number(),
});

export const schemaCoeffLogistique = z.object({
  etage_sans_supplement: z.coerce.number(),
  ascenseur: z.coerce.number(),
  escalier_base: z.coerce.number(),
  escalier_par_etage_sup: z.coerce.number(),
  escalier_plafond: z.coerce.number(),
  monte_charge: z.coerce.number(),
  exterieur: z.coerce.number(),
});

export const schemaSurfaceDefaut = z.object({
  maison: z.coerce.number(),
  appartement: z.coerce.number(),
  elargissement_min: z.coerce.number(),
  elargissement_max: z.coerce.number(),
});
