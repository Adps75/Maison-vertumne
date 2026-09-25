import { describe, it, expect } from "vitest";
import { schemaAnalyseIA } from "../validation/analyse";

const analyseValide = {
  observations: {
    synthese_demande: "Le client souhaite réaménager son jardin.",
    existant: ["Gazon en mauvais état", "Haie de thuyas"],
    etat_vegetation: "Végétation peu entretenue, gazon clairsemé.",
    contraintes_visibles: ["Pente légère", "Ombre d'un grand arbre"],
    orientation_jardin: "Sud-ouest",
    pistes_amenagement: [
      { titre: "Terrasse ombragée", description: "Profiter de l'arbre existant." },
      { titre: "Massif méditerranéen", description: "Plantes résistantes à la sécheresse." },
    ],
    niveau_confiance: "moyen",
  },
  fiche_interne: {
    perimetre_reel: { valeur: "complet", confiance: "moyen" },
    coherence_estimation: { valeur: "coherente", explication: "Budget en ligne avec les prestations." },
    acces: { valeur: "facile", confiance: "moyen", indices: "Portail visible sur la photo 1." },
    niveau_gamme_apparent: "soigne",
    signaux_interet: ["Description détaillée", "Photos bien prises"],
    points_vigilance: ["Pente à prendre en compte"],
    questions_appel: [
      "Avez-vous un système d'arrosage existant ?",
      "Souhaitez-vous conserver l'arbre existant ?",
      "Avez-vous des contraintes de mitoyenneté ?",
    ],
  },
};

describe("schemaAnalyseIA", () => {
  it("accepte une analyse valide", () => {
    expect(schemaAnalyseIA.safeParse(analyseValide).success).toBe(true);
  });

  it("refuse si synthese_demande est manquante", () => {
    const sans = structuredClone(analyseValide);
    delete (sans.observations as Record<string, unknown>).synthese_demande;
    expect(schemaAnalyseIA.safeParse(sans).success).toBe(false);
  });

  it("refuse si niveau_confiance est hors énumération", () => {
    const mauvais = structuredClone(analyseValide);
    mauvais.observations.niveau_confiance = "tres_eleve" as never;
    expect(schemaAnalyseIA.safeParse(mauvais).success).toBe(false);
  });

  it("refuse si perimetre_reel.valeur est hors énumération", () => {
    const mauvais = structuredClone(analyseValide);
    mauvais.fiche_interne.perimetre_reel.valeur = "enorme" as never;
    expect(schemaAnalyseIA.safeParse(mauvais).success).toBe(false);
  });

  it("refuse si questions_appel a moins de 3 éléments", () => {
    const mauvais = structuredClone(analyseValide);
    mauvais.fiche_interne.questions_appel = ["Q1", "Q2"];
    expect(schemaAnalyseIA.safeParse(mauvais).success).toBe(false);
  });

  it("refuse si pistes_amenagement est vide", () => {
    const mauvais = structuredClone(analyseValide);
    mauvais.observations.pistes_amenagement = [];
    expect(schemaAnalyseIA.safeParse(mauvais).success).toBe(false);
  });
});
