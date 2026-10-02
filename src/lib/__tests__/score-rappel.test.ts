import { describe, it, expect } from "vitest";
import { calculerScore, type LeadPourScore } from "../score";

describe("recalcul du score après demande de rappel", () => {
  const baseLead: LeadPourScore = {
    fourchette_max: 8000,
    fourchette_min: 4000,
    lat: 48.7811,
    lon: 2.2629,
    proprietaire: true,
    urgence: "3_6_mois",
    budget_declare: "5k_15k",
    rappel_souhaite: false,
    description: "Un projet de jardin.",
    types_amenagement: ["massifs", "gazon"],
    nb_photos: 3,
  };

  it("demande de rappel ajoute 10 points de fiabilité", () => {
    const sansRappel = calculerScore({ ...baseLead, rappel_souhaite: false }, null);
    const avecRappel = calculerScore({ ...baseLead, rappel_souhaite: true }, null);

    expect(avecRappel.fiabilite - sansRappel.fiabilite).toBe(10);
    expect(avecRappel.total - sansRappel.total).toBe(10);
  });

  it("la catégorie peut changer après un rappel", () => {
    // Lead juste en dessous du seuil A (70)
    const lead: LeadPourScore = {
      ...baseLead,
      fourchette_max: 20000,
      urgence: "moins_3_mois",
      proprietaire: true,
      nb_photos: 4,
      description: "A".repeat(101),
      rappel_souhaite: false,
    };

    const sansRappel = calculerScore(lead, null);
    const avecRappel = calculerScore({ ...lead, rappel_souhaite: true }, null);

    // Le rappel peut faire passer de B à A
    expect(avecRappel.total).toBeGreaterThan(sansRappel.total);
  });
});
