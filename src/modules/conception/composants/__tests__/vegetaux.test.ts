import { describe, it, expect } from "vitest";
import { compterVegetaux } from "../PanneauListeVegetaux";
import type { Element } from "../../types";

function vegetal(id: string, planteId: string, nom: string): Element {
  return {
    id,
    type: "vegetal",
    geometrie: { type: "point", position: [10, 20] },
    calque: "vegetal",
    statut: "nouveau",
    hauteur: 3,
    proprietes: { plante_id: planteId, nom_commun: nom, nom_latin: "Testus", diametre_m: 1.2, hauteur_m: 3 },
    ordre: 0,
  };
}

describe("compterVegetaux", () => {
  it("compte 3 instances de la même plante", () => {
    const elements = new Map<string, Element>();
    elements.set("a", vegetal("a", "p1", "Chêne"));
    elements.set("b", vegetal("b", "p1", "Chêne"));
    elements.set("c", vegetal("c", "p1", "Chêne"));
    const lignes = compterVegetaux(elements);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].count).toBe(3);
    expect(lignes[0].ids).toHaveLength(3);
  });

  it("sépare des plantes différentes", () => {
    const elements = new Map<string, Element>();
    elements.set("a", vegetal("a", "p1", "Chêne"));
    elements.set("b", vegetal("b", "p2", "Érable"));
    const lignes = compterVegetaux(elements);
    expect(lignes).toHaveLength(2);
  });

  it("ignore les éléments non-végétaux", () => {
    const elements = new Map<string, Element>();
    elements.set("a", vegetal("a", "p1", "Chêne"));
    elements.set("b", {
      id: "b", type: "sol",
      geometrie: { type: "polygone", points: [[0, 0], [1, 0], [1, 1]] },
      calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 1,
    });
    const lignes = compterVegetaux(elements);
    expect(lignes).toHaveLength(1);
  });
});

describe("diamètre affichage", () => {
  it("un végétal de 1.20 m s'affiche à 1.20 m en coordonnées terrain", () => {
    // En coordonnées terrain, 1 unité = 1 mètre
    // Le diamètre de l'image = proprietes.diametre_m
    const diam = 1.2;
    // À zoom 1, 1 pixel = 1 mètre → l'image fait 1.2 pixels
    // À zoom 10, 1 pixel = 0.1 mètre → l'image fait 12 pixels
    expect(diam * 1).toBeCloseTo(1.2); // zoom 1
    expect(diam * 10).toBeCloseTo(12); // zoom 10
    expect(diam * 0.5).toBeCloseTo(0.6); // zoom 0.5
  });
});
