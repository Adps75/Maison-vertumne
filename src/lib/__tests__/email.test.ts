import { describe, it, expect } from "vitest";
import {
  emailClient,
  emailRepli,
  emailAdmin,
  emailRappel,
} from "../email/templates";

describe("templates email", () => {
  it("email client ne contient aucun champ de la fiche interne", () => {
    const { html } = emailClient("Adrien", "https://example.com/diagnostic?l=1&e=2&s=3");
    const fichiersInternes = [
      "perimetre_reel",
      "coherence_estimation",
      "niveau_gamme",
      "signaux_interet",
      "points_vigilance",
      "questions_appel",
      "fiche_interne",
      "fiche interne",
    ];
    for (const terme of fichiersInternes) {
      expect(html.toLowerCase()).not.toContain(terme.toLowerCase());
    }
  });

  it("email de repli contient la fourchette", () => {
    const { html, objet } = emailRepli("Marie", 5000, 12000, "https://example.com/d");
    // toLocaleString utilise des espaces insécables — vérifier les chiffres
    expect(html).toContain("5");
    expect(html).toContain("000");
    expect(html).toContain("12");
    expect(objet).toContain("Atelier des Prés");
  });

  it("email admin contient les questions d'appel et le score", () => {
    const { html, objet } = emailAdmin({
      prenom: "Pierre",
      commune: "Sceaux",
      fourchette: "8 000 – 15 000 €",
      categorie: "B",
      scoreTotal: 55,
      scoreDetail: { proprietaire: 15, delai: 10 },
      synthese: "Réfection du jardin",
      pointsVigilance: ["Pente"],
      questionsAppel: ["Arrosage existant ?"],
      email: "pierre@test.fr",
      telephone: "+33612345678",
      lienFiche: "https://example.com/dev/leads/123",
    });
    expect(objet).toContain("[B]");
    expect(html).toContain("Arrosage existant");
    expect(html).toContain("55/100");
  });

  it("email rappel affiche la catégorie recalculée", () => {
    const { objet } = emailRappel({
      prenom: "Sophie",
      commune: "Antony",
      categorie: "A",
      creneau: "semaine_matin",
      telephone: "+33612345678",
      email: "sophie@test.fr",
      lienFiche: "https://example.com/dev/leads/456",
    });
    expect(objet).toContain("[A]");
    expect(objet).toContain("Rappel demandé");
  });
});
