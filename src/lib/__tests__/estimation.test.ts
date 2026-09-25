import { describe, it, expect } from "vitest";
import { calculerFourchette } from "../estimation";
import type { Tarif, ParametresEstimation, ProjetEstimation } from "../types/tarifs";

const params: ParametresEstimation = {
  degressivite: { seuil_bas: 30, coeff_bas: 1.15, seuil_haut: 200, coeff_haut: 0.9 },
  coeff_logistique: {
    etage_sans_supplement: 1,
    ascenseur: 1.10,
    escalier_base: 1.10,
    escalier_par_etage_sup: 0.05,
    escalier_plafond: 1.50,
    monte_charge: 1.20,
    exterieur: 1.20,
  },
  surface_defaut: { maison: 75, appartement: 15, elargissement_min: 0.8, elargissement_max: 1.3 },
};

const tarifsMaison: Tarif[] = [
  { type_amenagement: "massifs", prix_m2_min: 25, prix_m2_max: 70, mode: "part", part_defaut: 0.30, forfait_minimum: 500 },
  { type_amenagement: "gazon", prix_m2_min: 10, prix_m2_max: 25, mode: "part", part_defaut: 0.60, forfait_minimum: 400 },
  { type_amenagement: "arrosage", prix_m2_min: 10, prix_m2_max: 20, mode: "global", part_defaut: null, forfait_minimum: 1200 },
  { type_amenagement: "creation_complete", prix_m2_min: 60, prix_m2_max: 160, mode: "part", part_defaut: 1.00, forfait_minimum: 3000 },
  { type_amenagement: "terrasse_bois", prix_m2_min: 110, prix_m2_max: 250, mode: "part", part_defaut: 0.20, forfait_minimum: 2500 },
];

const tarifsAppart: Tarif[] = [
  { type_amenagement: "bacs_jardinieres", prix_m2_min: 80, prix_m2_max: 250, mode: "part", part_defaut: 0.40, forfait_minimum: 600 },
  { type_amenagement: "plantations", prix_m2_min: 40, prix_m2_max: 120, mode: "part", part_defaut: 0.40, forfait_minimum: 300 },
  { type_amenagement: "eclairage", prix_m2_min: 10, prix_m2_max: 30, mode: "global", part_defaut: null, forfait_minimum: 300 },
];

describe("calculerFourchette", () => {
  it("prestation seule en mode part", () => {
    // massifs, 100 m², part 30% → min = 25 × 100 × 0.30 = 750, max = 70 × 100 × 0.30 = 2100
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["massifs"], surface: 100 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(800); // arrondi centaine
    expect(r.max).toBe(2100);
  });

  it("prestation globale", () => {
    // arrosage, 100 m² → min = 10 × 100 = 1000, max = 20 × 100 = 2000
    // mais forfait min = 1200 → min = 1200
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["arrosage"], surface: 100 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(1200);
    expect(r.max).toBe(2000);
  });

  it("forfait minimum atteint", () => {
    // massifs, 10 m², part 30% → min = 25 × 10 × 0.30 = 75 → forfait 500
    // 10 < 30 → dégressivité × 1.15 → 500 × 1.15 = 575, arrondi 600
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["massifs"], surface: 10 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(600);
  });

  it("combinaison de parts dépassant 100%", () => {
    // massifs (0.30) + gazon (0.60) + terrasse_bois (0.20) = 1.10 > 1
    // normalisé : massifs 0.30/1.10, gazon 0.60/1.10, terrasse 0.20/1.10
    // Surface 100 m²
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["massifs", "gazon", "terrasse_bois"], surface: 100 },
      tarifsMaison,
      params,
    );
    // min = 25×100×(0.30/1.10) + 10×100×(0.60/1.10) + max(110×100×(0.20/1.10), 2500)
    // = 681.8 + 545.5 + 2500 = 3727 → arrondi 3700
    expect(r.min).toBeGreaterThan(3000);
    expect(r.min).toBeLessThan(4000);
    // les 3 prestations sont dans le détail
    expect(r.detail).toHaveLength(3);
  });

  it("dégressivité petite surface (< 30 m²)", () => {
    // creation_complete, 20 m², part 100% → min = 60 × 20 = 1200, mais forfait 3000
    // 20 < 30 → × 1.15 → 3450, arrondi centaine → 3400 (Math.round(34.5) = 34)
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["creation_complete"], surface: 20 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(3400);
  });

  it("dégressivité grande surface (> 200 m²)", () => {
    // creation_complete, 300 m² → min = 60 × 300 = 18000, max = 160 × 300 = 48000
    // × 0.9 → 16200, 43200 → arrondi 16000, 43000
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["creation_complete"], surface: 300 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(16000);
    expect(r.max).toBe(43000);
  });

  it("surface inconnue : élargissement", () => {
    // creation_complete, surface null → utilise 75 m² (défaut maison)
    // min = 60 × 75 = 4500 → × 0.8 = 3600, arrondi 3600
    // max = 160 × 75 = 12000 → × 1.3 = 15600, arrondi 16000
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["creation_complete"], surface: null },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(3600);
    expect(r.max).toBe(16000);
  });

  it("arrondi à la centaine sous 5000", () => {
    // massifs, 50 m², part 30% → min = 25 × 50 × 0.30 = 375 → forfait 500
    // pas de dégressivité (50 >= 30 et <= 200)
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["massifs"], surface: 50 },
      tarifsMaison,
      params,
    );
    expect(r.min).toBe(500); // exactement le forfait
    expect(r.min % 100).toBe(0);
  });

  it("arrondi au millier à exactement 5000", () => {
    // creation_complete, 50 m² → min = 60 × 50 × 1 = 3000, max = 160 × 50 = 8000
    // 8000 >= 5000 → arrondi millier → 8000
    const r = calculerFourchette(
      { type_lieu: "maison", types_amenagement: ["creation_complete"], surface: 50 },
      tarifsMaison,
      params,
    );
    expect(r.max % 1000).toBe(0);
  });

  // --- Appartement ---

  it("appartement au 1er étage (pas de supplément)", () => {
    // bacs_jardinieres, 15 m², part 40% → min = 80 × 15 × 0.40 = 480 → forfait 600
    // étage 1 <= etage_sans_supplement (1) → coeff 1.0
    // 15 < 30 → dégressivité × 1.15 → 690, arrondi 700
    const r = calculerFourchette(
      { type_lieu: "appartement", types_amenagement: ["bacs_jardinieres"], surface: 15, etage: 1, acces: "ascenseur" },
      tarifsAppart,
      params,
    );
    expect(r.min).toBe(700);
  });

  it("appartement 5e étage avec ascenseur (× 1.10)", () => {
    // bacs_jardinieres, 15 m², part 40% → min = 480 → forfait 600
    // × 1.15 (< 30 m²) = 690
    // × 1.10 (ascenseur, étage > 1) = 759, arrondi 800
    const r = calculerFourchette(
      { type_lieu: "appartement", types_amenagement: ["bacs_jardinieres"], surface: 15, etage: 5, acces: "ascenseur" },
      tarifsAppart,
      params,
    );
    expect(r.min).toBe(800);
  });

  it("appartement 5e étage escalier seul", () => {
    // escalier_base 1.10 + (5 - 1) × 0.05 = 1.30
    const r = calculerFourchette(
      { type_lieu: "appartement", types_amenagement: ["bacs_jardinieres"], surface: 15, etage: 5, acces: "escalier" },
      tarifsAppart,
      params,
    );
    // 600 × 1.15 = 690, × 1.30 = 897, arrondi 900
    expect(r.min).toBe(900);
  });

  it("plafond escalier à 1.50 (10e étage)", () => {
    // escalier_base 1.10 + (10 - 1) × 0.05 = 1.55 → plafonné 1.50
    const r = calculerFourchette(
      { type_lieu: "appartement", types_amenagement: ["bacs_jardinieres"], surface: 15, etage: 10, acces: "escalier" },
      tarifsAppart,
      params,
    );
    // 600 × 1.15 = 690, × 1.50 = 1035, arrondi 1000
    expect(r.min).toBe(1000);
  });

  it("monte-charge (× 1.20)", () => {
    const r = calculerFourchette(
      { type_lieu: "appartement", types_amenagement: ["bacs_jardinieres"], surface: 15, etage: 5, acces: "monte_charge" },
      tarifsAppart,
      params,
    );
    // 600 × 1.15 = 690, × 1.20 = 828, arrondi 800
    expect(r.min).toBe(800);
  });
});
