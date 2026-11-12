import { describe, it, expect } from "vitest";
import { z } from "zod";
import { coutAnthropic, nettoyerPalette, type PlanteBibliotheque } from "../controles";
import { schemaPalette, schemaIntention, schemaBrief, CONTEXTE_CLIMATIQUE_DEFAUT, type Palette } from "../schemas";
import { nettoyerAnalyse } from "../controles";
import { schemaAnalyse } from "../schemas";
import { grilleMassif } from "../grille";

const biblio = (id: string, nom_latin: string): PlanteBibliotheque => ({
  id, nom_latin, nom_commun: id, categorie: "vivace", hauteur_adulte_m: 0.6, largeur_adulte_m: 0.5,
  largeur_3ans_m: null, forme: null, feuillage: "caduc", couleur_floraison: null, periode_floraison: null,
  exposition: null, besoin_eau: null, resistance_secheresse: null,
});

const fiche = (nom_latin: string) => ({
  nom_latin, nom_commun: "x", categorie: "vivace" as const, largeur_adulte_m: 0.5, hauteur_adulte_m: 0.6,
  largeur_3ans_m: 0.4, forme: "touffe" as const, feuillage: "caduc" as const, couleur_feuillage: "vert",
  couleur_floraison: null, periode_floraison: null, exposition: ["soleil" as const], besoin_eau: "faible" as const,
  resistance_secheresse: "elevee" as const, raison: "r", incertitude: null,
});

describe("nettoyage de la palette", () => {
  const bibliotheque = [biblio("a", "Salvia nemorosa"), biblio("b", "Geranium 'Rozanne'")];

  it("retire les identifiants inconnus et le signale", () => {
    const p: Palette = { retenues: [{ plante_id: "a", raison: "" }, { plante_id: "inventee", raison: "" }], ajouts: [], remarques: "" };
    const r = nettoyerPalette(p, bibliotheque);
    expect(r.retenues.map((x) => x.plante_id)).toEqual(["a"]);
    expect(r.remarques).toMatch(/1 plante/);
  });

  it("un ajout déjà présent dans la bibliothèque devient une plante retenue", () => {
    const p: Palette = { retenues: [], ajouts: [fiche("geranium 'rozanne'"), fiche("Stipa tenuissima")], remarques: "" };
    const r = nettoyerPalette(p, bibliotheque);
    expect(r.retenues.map((x) => x.plante_id)).toEqual(["b"]);
    expect(r.ajouts.map((x) => x.nom_latin)).toEqual(["Stipa tenuissima"]);
  });
});

describe("validation Zod des réponses de l'IA", () => {
  it("palette valide acceptée", () => {
    expect(schemaPalette.safeParse({ retenues: [{ plante_id: "a", raison: "r" }], ajouts: [fiche("Stipa tenuissima")], remarques: "" }).success).toBe(true);
  });
  it("catégorie inconnue, champ manquant : refusée", () => {
    expect(schemaPalette.safeParse({ retenues: [], ajouts: [{ ...fiche("X"), categorie: "cactus" }], remarques: "" }).success).toBe(false);
    expect(schemaPalette.safeParse({ retenues: [], ajouts: [] }).success).toBe(false);
  });
  it("intention : quantité non entière ou rôle inconnu refusés", () => {
    const base = { plante_id: "a", quantite: 3, role: "masse", profondeur: "milieu", taille_groupe: 3, repetitions: 1 };
    expect(schemaIntention.safeParse({ plantes: [base], geometrie: null, explication: "" }).success).toBe(true);
    expect(schemaIntention.safeParse({ plantes: [{ ...base, quantite: 2.5 }], geometrie: null, explication: "" }).success).toBe(false);
    expect(schemaIntention.safeParse({ plantes: [{ ...base, role: "decor" }], geometrie: null, explication: "" }).success).toBe(false);
  });
  it("aucun champ de coordonnées dans les sorties de l'IA", () => {
    const texte = JSON.stringify([z.toJSONSchema(schemaPalette), z.toJSONSchema(schemaIntention)]);
    expect(texte).toContain('"plante_id"'); // le schéma n'est pas vide
    expect(texte).not.toMatch(/"(x|y|position|positions|coordonnees|lat|lon|longitude|latitude)"/);
  });
  it("brief : contexte climatique par défaut accepté", () => {
    expect(schemaBrief.safeParse({
      description: "", style: "naturel_graminees", structure: "libre", couleurs: [], saisons: ["ete"],
      hauteurMin: 0.2, hauteurMax: 1.5, partPersistants: 30, entretien: "faible", densite: "standard",
      secheresse: "elevee", contexteClimatique: CONTEXTE_CLIMATIQUE_DEFAUT,
    }).success).toBe(true);
  });
});

describe("coût Anthropic", () => {
  it("Claude Opus 5.5 : 4 $ / 20 $ par million de jetons, converti en euros", () => {
    expect(coutAnthropic("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(3.68, 4);
    expect(coutAnthropic("claude-opus-5-5", { input_tokens: 0, output_tokens: 100_000 })).toBeCloseTo(1.84, 4);
  });
  it("Claude Sonnet 5.5 et modèle inconnu", () => {
    expect(coutAnthropic("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(1.84, 4);
    expect(coutAnthropic("modele-inconnu", { input_tokens: 1000, output_tokens: 1000 })).toBe(0);
  });
});


describe("nettoyage de l'analyse", () => {
  const g = grilleMassif([[-1, 8], [3, 8], [3, 12], [-1, 12]]); // 10 × 10 cases
  const base = {
    style_existant: "s", ambiance: "a", premier_plan: "p", fond: "f", remarques: "",
    ombre_lumiere: { ombre: [{ cases: ["b2", "Z9"], description: "o" }], lumiere: [{ cases: ["Q1"], description: "l" }] },
  };
  const el = (cases: string[]) => ({ nature: "arbre" as const, description: "d", espece_probable: null, confiance: "faible" as const, cases, hauteur_estimee_m: null, recommandation: "conserver" as const });

  it("cases normalisées, hors grille écartées, élément sans case retiré et signalé", () => {
    const r = nettoyerAnalyse({ ...base, existants: [el(["c4", "C4", "K1"]), el(["Z99"])] }, g);
    expect(r.existants.map((e) => e.cases)).toEqual([["C4"]]);
    expect(r.remarques).toMatch(/1 élément/);
    expect(r.ombre_lumiere.ombre).toEqual([{ cases: ["B2"], description: "o" }]);
    expect(r.ombre_lumiere.lumiere).toEqual([]);
  });

  it("schéma : nature inconnue ou confiance manquante refusées", () => {
    expect(schemaAnalyse.safeParse({ ...base, existants: [el(["A1"])] }).success).toBe(true);
    expect(schemaAnalyse.safeParse({ ...base, existants: [{ ...el(["A1"]), nature: "licorne" }] }).success).toBe(false);
    const sansConfiance: Record<string, unknown> = { ...el(["A1"]) };
    delete sansConfiance.confiance;
    expect(schemaAnalyse.safeParse({ ...base, existants: [sansConfiance] }).success).toBe(false);
  });
});
