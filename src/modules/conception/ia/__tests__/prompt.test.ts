import { describe, it, expect } from "vitest";
import { promptFace, promptDessus } from "../prompt";

const fiche = {
  nom_latin: "Prunus serrulata 'Kanzan'",
  forme: "etalee",
  couleur_feuillage: "vert foncé",
  couleur_floraison: "rose double",
  periode_floraison: "avril-mai",
  feuillage: "caduc",
  hauteur_adulte_m: 8,
  largeur_adulte_m: 6,
  floraison_visible: true,
};

describe("promptFace", () => {
  it("contient le nom latin", () => {
    const p = promptFace(fiche, false);
    expect(p).toContain("Prunus serrulata");
  });

  it("contient le style de base", () => {
    const p = promptFace(fiche, false);
    expect(p).toContain("botanical illustration");
  });

  it("ne mentionne pas le fond", () => {
    const p = promptFace(fiche, false);
    expect(p.toLowerCase()).not.toContain("background");
    expect(p.toLowerCase()).not.toContain("fond");
  });

  it("contient la vue de face", () => {
    const p = promptFace(fiche, false);
    expect(p).toContain("side view");
  });

  it("avec référence : contient l'instruction de style", () => {
    const p = promptFace(fiche, true);
    expect(p).toContain("same rendering style");
  });

  it("sans référence : pas d'instruction de style", () => {
    const p = promptFace(fiche, false);
    expect(p).not.toContain("same rendering style");
  });

  it("floraison_visible=false → sans fleurs", () => {
    const p = promptFace({ ...fiche, floraison_visible: false }, false);
    expect(p).toContain("without flowers");
    expect(p).not.toContain("rose double");
  });

  it("floraison_visible=true → avec fleurs, pas de consigne de les cacher", () => {
    const p = promptFace({ ...fiche, floraison_visible: true }, false);
    expect(p).toContain("rose double");
    // La consigne spécifique "Show the plant without flowers" ne doit pas être ajoutée
    expect(p).not.toContain("flowering is discreet");
  });

  it("forme boule → sphère taillée", () => {
    const p = promptFace({ ...fiche, forme: "boule" }, false);
    expect(p).toContain("sphere");
    expect(p).toContain("dense");
  });
});

describe("promptDessus", () => {
  it("contient la vue de dessus", () => {
    const p = promptDessus(fiche, false);
    expect(p).toContain("top-down");
  });

  it("ne mentionne pas le fond", () => {
    const p = promptDessus(fiche, false);
    expect(p.toLowerCase()).not.toContain("background");
  });

  it("contient la largeur", () => {
    const p = promptDessus(fiche, false);
    expect(p).toContain("6 m");
  });
});
