import { describe, it, expect } from "vitest";
import {
  schemaProjetMaison,
  schemaProjetAppartement,
  schemaPrecisions,
} from "../validation/projet";
import { medianeParCode } from "@/config/amenagements";

// --- Projet maison ---

const maisonValide = {
  types_amenagement: ["massifs", "gazon"],
  tranche_surface: "50_100",
  description: "Je souhaite refaire entièrement mon jardin avec des massifs et du gazon.",
};

describe("schemaProjetMaison", () => {
  it("accepte des données valides", () => {
    expect(schemaProjetMaison.safeParse(maisonValide).success).toBe(true);
  });

  it("refuse types_amenagement vide", () => {
    expect(
      schemaProjetMaison.safeParse({ ...maisonValide, types_amenagement: [] }).success,
    ).toBe(false);
  });

  it("refuse une description < 30 caractères", () => {
    expect(
      schemaProjetMaison.safeParse({ ...maisonValide, description: "Trop court." }).success,
    ).toBe(false);
  });

  it("accepte creation_complete seul", () => {
    expect(
      schemaProjetMaison.safeParse({
        ...maisonValide,
        types_amenagement: ["creation_complete"],
      }).success,
    ).toBe(true);
  });

  it("refuse creation_complete combiné avec un autre choix", () => {
    expect(
      schemaProjetMaison.safeParse({
        ...maisonValide,
        types_amenagement: ["creation_complete", "gazon"],
      }).success,
    ).toBe(false);
  });

  it("refuse un code d'aménagement inconnu", () => {
    expect(
      schemaProjetMaison.safeParse({
        ...maisonValide,
        types_amenagement: ["piscine"],
      }).success,
    ).toBe(false);
  });

  it("refuse un code d'aménagement appartement", () => {
    expect(
      schemaProjetMaison.safeParse({
        ...maisonValide,
        types_amenagement: ["bacs_jardinieres"],
      }).success,
    ).toBe(false);
  });

  it("refuse une tranche appartement pour une maison", () => {
    expect(
      schemaProjetMaison.safeParse({
        ...maisonValide,
        tranche_surface: "moins_5",
      }).success,
    ).toBe(false);
  });
});

// --- Projet appartement ---

const appartValide = {
  types_amenagement: ["bacs_jardinieres", "plantations"],
  tranche_surface: "10_20",
  description: "Je veux aménager ma terrasse avec des bacs et des plantes résistantes.",
  type_espace: "terrasse" as const,
  etage: 3,
  acces: "ascenseur" as const,
  orientation_espace: "sud" as const,
  accord_copro: "obtenu" as const,
};

describe("schemaProjetAppartement", () => {
  it("accepte des données valides", () => {
    expect(schemaProjetAppartement.safeParse(appartValide).success).toBe(true);
  });

  it("refuse un code d'aménagement maison", () => {
    expect(
      schemaProjetAppartement.safeParse({
        ...appartValide,
        types_amenagement: ["gazon"],
      }).success,
    ).toBe(false);
  });

  it("refuse une tranche maison pour un appartement", () => {
    expect(
      schemaProjetAppartement.safeParse({
        ...appartValide,
        tranche_surface: "100_300",
      }).success,
    ).toBe(false);
  });

  it("refuse un étage négatif", () => {
    expect(
      schemaProjetAppartement.safeParse({
        ...appartValide,
        etage: -1,
      }).success,
    ).toBe(false);
  });

  it("accepte étage 0 (rez-de-chaussée)", () => {
    expect(
      schemaProjetAppartement.safeParse({
        ...appartValide,
        etage: 0,
      }).success,
    ).toBe(true);
  });
});

// --- Précisions ---

describe("schemaPrecisions", () => {
  const valide = {
    budget_declare: "5k_15k" as const,
    urgence: "3_6_mois" as const,
    proprietaire: true,
  };

  it("accepte des données valides", () => {
    expect(schemaPrecisions.safeParse(valide).success).toBe(true);
  });

  it("refuse sans budget", () => {
    const { budget_declare: _, ...sans } = valide;
    expect(schemaPrecisions.safeParse(sans).success).toBe(false);
  });

  it("refuse sans urgence", () => {
    const { urgence: _, ...sans } = valide;
    expect(schemaPrecisions.safeParse(sans).success).toBe(false);
  });
});

// --- Médianes ---

describe("medianeParCode", () => {
  it("renvoie 75 pour maison 50_100", () => {
    expect(medianeParCode("maison", "50_100")).toBe(75);
  });

  it("renvoie null pour ne_sait_pas", () => {
    expect(medianeParCode("maison", "ne_sait_pas")).toBeNull();
  });

  it("renvoie 7.5 pour appartement 5_10", () => {
    expect(medianeParCode("appartement", "5_10")).toBe(7.5);
  });

  it("renvoie null pour un code inconnu", () => {
    expect(medianeParCode("maison", "inexistant")).toBeNull();
  });
});
