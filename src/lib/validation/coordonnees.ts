import { z } from "zod";

/** Supprime espaces, points, tirets d'un numéro de téléphone. */
function nettoyerTelephone(tel: string): string {
  return tel.replace(/[\s.\-()]/g, "");
}

/** Normalise un numéro de téléphone français au format +33. */
export function normaliserTelephone(tel: string): string {
  const propre = nettoyerTelephone(tel);

  // +33 suivi de 9 chiffres (ex: +33612345678)
  if (/^\+33[1-9]\d{8}$/.test(propre)) {
    return propre;
  }

  // 0033 suivi de 9 chiffres
  if (/^0033[1-9]\d{8}$/.test(propre)) {
    return "+33" + propre.slice(4);
  }

  // 0X suivi de 8 chiffres (ex: 0612345678, 0112345678)
  if (/^0[1-9]\d{8}$/.test(propre)) {
    return "+33" + propre.slice(1);
  }

  return propre;
}

const TEL_REGEX = /^0[1-9]\d{8}$|^\+33[1-9]\d{8}$|^0033[1-9]\d{8}$/;

/** Schéma de validation des coordonnées du visiteur. */
export const schemaCoordonnees = z.object({
  prenom: z
    .string()
    .min(1, "Le prénom est requis."),
  email: z
    .string()
    .min(1, "L'adresse email est requise.")
    .email("L'adresse email n'est pas valide."),
  telephone: z
    .string()
    .min(1, "Le numéro de téléphone est requis.")
    .transform(nettoyerTelephone)
    .refine((val) => TEL_REGEX.test(val), {
      message: "Le numéro de téléphone n'est pas valide. Exemple : 06 12 34 56 78",
    }),
  consentement: z.literal(true, {
    message: "Vous devez accepter pour continuer.",
  }),
});

export type CoordonneesInput = z.input<typeof schemaCoordonnees>;
export type CoordonneesOutput = z.output<typeof schemaCoordonnees>;
