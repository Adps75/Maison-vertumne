import "server-only";

import type { AnalyseIA } from "./validation/analyse";
import { amenagementsPourLieu } from "@/config/amenagements";

const PROMPT_SYSTEME = `Tu es un paysagiste expérimenté qui analyse des dossiers de demande d'aménagement extérieur en Île-de-France. Tu observes les photos et l'image aérienne pour produire un pré-diagnostic.

Règles strictes :
- N'affirme rien qui n'est pas visible sur les images. Signale les incertitudes.
- Ne te prononce jamais sur le sol, les réseaux enterrés ou la structure du bâtiment.
- Reste factuel et bienveillant dans les observations destinées au client.
- La fiche interne est destinée au paysagiste, pas au client : sois direct et précis.
- Utilise l'outil "analyse_dossier" pour structurer ta réponse.`;

interface PhotoMessage {
  ordre: number;
  lat?: number;
  lon?: number;
  orientation_degres?: number;
  legende?: string;
}

interface DonneesDossier {
  type_lieu: string;
  surface_parcelle?: number | null;
  tranche_surface?: string | null;
  types_amenagement: string[];
  description: string;
  budget_declare: string;
  urgence: string;
  fourchette_min: number;
  fourchette_max: number;
  photos: PhotoMessage[];
}

export function construirePromptSysteme(): string {
  return PROMPT_SYSTEME;
}

export function construireMessageUtilisateur(dossier: DonneesDossier): string {
  const libelles = new Map(
    amenagementsPourLieu(dossier.type_lieu as "maison" | "appartement").map(
      (a) => [a.code, a.libelle],
    ),
  );

  const parties: string[] = [
    `Type de lieu : ${dossier.type_lieu}`,
  ];

  if (dossier.surface_parcelle) {
    parties.push(`Surface de la parcelle : ${dossier.surface_parcelle} m²`);
  }
  if (dossier.tranche_surface) {
    parties.push(`Tranche de surface du projet : ${dossier.tranche_surface}`);
  }

  parties.push(
    `Prestations demandées : ${dossier.types_amenagement.map((c) => libelles.get(c) ?? c).join(", ")}`,
    `Description du client : ${dossier.description}`,
    `Budget déclaré : ${dossier.budget_declare}`,
    `Délai souhaité : ${dossier.urgence}`,
    `Fourchette estimée : ${dossier.fourchette_min.toLocaleString("fr-FR")} € à ${dossier.fourchette_max.toLocaleString("fr-FR")} € TTC`,
  );

  parties.push("");

  for (const photo of dossier.photos) {
    const details: string[] = [`Photo n°${photo.ordre}`];
    if (photo.lat != null && photo.lon != null) {
      details.push(`position : ${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}`);
    }
    if (photo.orientation_degres != null) {
      details.push(`direction : ${photo.orientation_degres}° (0 = nord)`);
    }
    if (photo.legende) {
      details.push(`légende : ${photo.legende}`);
    }
    parties.push(details.join(" — "));
  }

  return parties.join("\n");
}

export function construireOutilAnalyse() {
  return {
    name: "analyse_dossier" as const,
    description:
      "Enregistre l'analyse du dossier avec les observations pour le client et la fiche interne pour le paysagiste.",
    input_schema: {
      type: "object" as const,
      required: ["observations", "fiche_interne"],
      properties: {
        observations: {
          type: "object",
          required: [
            "synthese_demande",
            "existant",
            "etat_vegetation",
            "contraintes_visibles",
            "orientation_jardin",
            "pistes_amenagement",
            "niveau_confiance",
          ],
          properties: {
            synthese_demande: { type: "string" },
            existant: { type: "array", items: { type: "string" } },
            etat_vegetation: { type: "string" },
            contraintes_visibles: { type: "array", items: { type: "string" } },
            orientation_jardin: { type: "string" },
            pistes_amenagement: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: {
                type: "object",
                required: ["titre", "description"],
                properties: {
                  titre: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
            niveau_confiance: {
              type: "string",
              enum: ["faible", "moyen", "eleve"],
            },
          },
        },
        fiche_interne: {
          type: "object",
          required: [
            "perimetre_reel",
            "coherence_estimation",
            "acces",
            "niveau_gamme_apparent",
            "signaux_interet",
            "points_vigilance",
            "questions_appel",
          ],
          properties: {
            perimetre_reel: {
              type: "object",
              required: ["valeur", "confiance"],
              properties: {
                valeur: { type: "string", enum: ["ponctuel", "partiel", "complet"] },
                confiance: { type: "string", enum: ["faible", "moyen", "eleve"] },
              },
            },
            coherence_estimation: {
              type: "object",
              required: ["valeur", "explication"],
              properties: {
                valeur: {
                  type: "string",
                  enum: [
                    "coherente",
                    "probablement_sous_evaluee",
                    "probablement_sur_evaluee",
                  ],
                },
                explication: { type: "string" },
              },
            },
            acces: {
              type: "object",
              required: ["valeur", "confiance", "indices"],
              properties: {
                valeur: {
                  type: "string",
                  enum: ["facile", "passage_etroit", "par_la_maison", "inconnu"],
                },
                confiance: { type: "string", enum: ["faible", "moyen", "eleve"] },
                indices: { type: "string" },
              },
            },
            niveau_gamme_apparent: {
              type: "string",
              enum: ["standard", "soigne", "haut_de_gamme"],
            },
            signaux_interet: { type: "array", items: { type: "string" } },
            points_vigilance: { type: "array", items: { type: "string" } },
            questions_appel: {
              type: "array",
              minItems: 3,
              maxItems: 5,
              items: { type: "string" },
            },
          },
        },
      },
    },
  };
}

// Re-export pour usage dans les tests
export type { AnalyseIA };
