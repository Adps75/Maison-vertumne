import { describe, it, expect } from "vitest";
import { consigneRendu, consigneStyle, consignePasse, plantesPrincipales, STYLES, STYLE_DEFAUT, LIBELLES_STYLES, type OptionsConsigne } from "../styles";

const base: OptionsConsigne = {
  style: "croquis", nbReferences: 2, annotations: false, plantesPrincipales: ["Gaura", "Perovskia"], materiaux: [], consignesSup: "",
};

describe("styles prédéfinis du rendu", () => {
  it("quatre styles, croquis par défaut", () => {
    expect(STYLES).toEqual(["croquis", "aquarelle", "feutres", "realiste"]);
    expect(STYLE_DEFAUT).toBe("croquis");
    expect(LIBELLES_STYLES.croquis).toBe("Croquis d'architecte paysagiste");
  });

  it("croquis : encre fine, lavis transparents, couleurs désaturées, papier en réserve, fond estompé, hachures", () => {
    const c = consigneStyle("croquis", 0);
    for (const m of [/ink linework/, /black or sepia felt-tip/, /transparent watercolour washes/, /desaturated/, /white paper/, /fade the background/, /sky/, /hatching/]) expect(c).toMatch(m);
  });

  it("références : reprendre le style SANS copier le contenu ; absentes de la consigne s'il n'y en a pas", () => {
    expect(consigneStyle("croquis", 2)).toMatch(/STYLE REFERENCES ONLY[\s\S]*do NOT copy their content/);
    expect(consigneStyle("croquis", 0)).not.toMatch(/REFERENCES/);
    expect(consigneStyle("realiste", 1)).toMatch(/do NOT copy their content/);
    expect(consigneStyle("realiste", 0)).toMatch(/Edit ONLY the transparent/);
  });

  it("même style sur deux vues : partie style identique, seules les parties propres à la vue changent", () => {
    const vue1 = consigneRendu({ ...base, materiaux: [{ nom: "Gazon (rénovation)", description: "pelouse", quantite: 20, unite: "m2", position: "à gauche du massif" }] });
    const vue2 = consigneRendu({ ...base, plantesPrincipales: ["Sauge"] });
    const style = consigneStyle("croquis", 2);
    expect(vue1.startsWith(style)).toBe(true);
    expect(vue2.startsWith(style)).toBe(true);
    // Mêmes options : consigne identique, déterministe
    expect(consigneRendu(base)).toBe(consigneRendu({ ...base }));
  });

  it("matériaux sans carte : quantité et description, jamais de position décrite en mots", () => {
    const m = [{ nom: "Volige acier", description: "lame d'acier", quantite: 12.5, unite: "ml" as const, position: "devant le massif, au premier plan" }];
    const c = consigneRendu({ ...base, materiaux: m });
    expect(c).toContain("- Volige acier (12,5 ml) : lame d'acier");
    expect(c).not.toContain("premier plan");
    expect(consigneRendu({ ...base, style: "realiste", materiaux: m })).toMatch(/Inside the transparent area, also render these project materials/);
  });

  it("carte des matériaux : deuxième image, chaque matériau uniquement dans sa zone, légende par couleur", () => {
    const carte = [{ nom: "Paillage écorce de pin", couleur: "rouge", description: "écorce de pin brun-rouge" }];
    const c = consigneRendu({ ...base, carte, materiaux: [{ nom: "Paillage écorce de pin", description: "x", quantite: 53.6, unite: "m2", position: "devant le massif" }] });
    expect(c).toMatch(/SECOND image is a MATERIAL MAP/);
    expect(c).toMatch(/each material only inside its coloured zone/);
    expect(c).toContain("- red = Paillage écorce de pin : écorce de pin brun-rouge");
    expect(c).not.toContain("devant le massif");
    // La partie style ne dépend pas de la carte : identique d'une vue à l'autre
    expect(c.startsWith(consigneStyle("croquis", 2))).toBe(true);
    expect(consigneStyle("croquis", 2)).toMatch(/LAST 2 images are STYLE REFERENCES/);
  });

  it("passe par matériau : seulement la zone transparente, bords conservés", () => {
    const c = consignePasse("croquis", { nom: "Gazon (rénovation)", description: "gazon dense" });
    expect(c).toMatch(/Edit ONLY the transparent/);
    expect(c).toContain("« Gazon (rénovation) » (gazon dense)");
    expect(c).toMatch(/do not draw it outside the transparent area/);
  });

  it("annotations : croquis seulement, noms des plantes principales avec une flèche ; sinon aucun texte", () => {
    expect(consigneRendu({ ...base, annotations: true })).toMatch(/handwritten labels[\s\S]*arrows[\s\S]*« Gaura », « Perovskia »/);
    expect(consigneRendu(base)).toMatch(/Do not add any text/);
    expect(consigneRendu({ ...base, style: "feutres", annotations: true })).toMatch(/Do not add any text/);
  });

  it("consignes supplémentaires ajoutées à la fin, sans effet si vides", () => {
    const c = consigneRendu({ ...base, consignesSup: "  fin d'été, lumière rasante du soir " });
    expect(c.endsWith("« fin d'été, lumière rasante du soir »")).toBe(true);
    expect(consigneRendu({ ...base, consignesSup: "   " })).not.toMatch(/Additional instructions/);
  });

  it("plantes principales : les plus nombreuses dans la vue, 5 au plus", () => {
    expect(plantesPrincipales(["A", "B", "A", "C", "B", "A", "D", "E", "F", ""])).toEqual(["A", "B", "C", "D", "E"]);
  });
});
