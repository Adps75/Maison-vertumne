import { describe, it, expect } from "vitest";
import { hitTestGeometrique, selectionParRectangle } from "../selection";
import type { Element, Calque } from "../../types";
import type { Pt } from "../../geo/plan";

const calques: Calque[] = [
  { nom: "defaut", visible: true, verrouille: false, couleur: "#fff" },
  { nom: "masque", visible: false, verrouille: false, couleur: "#fff" },
  { nom: "verrouille", visible: true, verrouille: true, couleur: "#fff" },
];

function polyEl(id: string, pts: Pt[], calque = "defaut"): Element {
  return {
    id,
    type: "sol",
    geometrie: { type: "polygone", points: pts },
    calque,
    statut: "nouveau",
    hauteur: null,
    proprietes: {},
    ordre: 0,
  };
}

function ligneEl(id: string, pts: Pt[], calque = "defaut"): Element {
  return {
    id,
    type: "limite",
    geometrie: { type: "polyligne", points: pts },
    calque,
    statut: "nouveau",
    hauteur: null,
    proprietes: {},
    ordre: 0,
  };
}

describe("hitTestGeometrique", () => {
  const carre = polyEl("carre", [[0, 0], [10, 0], [10, 10], [0, 10]]);
  const petitCarre = polyEl("petit", [[3, 3], [7, 3], [7, 7], [3, 7]]);
  const trait = ligneEl("trait", [[20, 0], [20, 10]]);

  it("clic à l'intérieur d'un polygone → trouvé", () => {
    const r = hitTestGeometrique([5, 5], [carre], calques, 1);
    expect(r?.id).toBe("carre");
  });

  it("le plus petit polygone gagne quand deux se superposent", () => {
    const r = hitTestGeometrique([5, 5], [carre, petitCarre], calques, 1);
    expect(r?.id).toBe("petit");
  });

  it("clic sur un trait fin (distance < 8 px)", () => {
    // À zoom 1, 8 px = 8 m de tolérance
    const r = hitTestGeometrique([22, 5], [trait], calques, 1);
    expect(r?.id).toBe("trait");
  });

  it("clic trop loin → null", () => {
    const r = hitTestGeometrique([50, 50], [carre], calques, 1);
    expect(r).toBeNull();
  });

  it("calque masqué → non sélectionnable", () => {
    const el = polyEl("masqueEl", [[0, 0], [10, 0], [10, 10], [0, 10]], "masque");
    const r = hitTestGeometrique([5, 5], [el], calques, 1);
    expect(r).toBeNull();
  });

  it("calque verrouillé → non sélectionnable", () => {
    const el = polyEl("verrouilleEl", [[0, 0], [10, 0], [10, 10], [0, 10]], "verrouille");
    const r = hitTestGeometrique([5, 5], [el], calques, 1);
    expect(r).toBeNull();
  });
});

describe("selectionParRectangle", () => {
  const elements = [
    polyEl("a", [[0, 0], [5, 0], [5, 5], [0, 5]]),
    polyEl("b", [[10, 10], [15, 10], [15, 15], [10, 15]]),
    polyEl("c", [[3, 3], [12, 3], [12, 12], [3, 12]]),
  ];

  it("gauche→droite : éléments entièrement inclus", () => {
    // Rectangle de [0,0] à [6,6] : contient entièrement "a"
    const ids = selectionParRectangle([0, 0], [6, 6], elements, calques);
    expect(ids).toContain("a");
    expect(ids).not.toContain("b");
    expect(ids).not.toContain("c"); // "c" déborde
  });

  it("droite→gauche : éléments touchés", () => {
    // Rectangle de [6,6] à [0,0] (droite→gauche) : touche "a" et "c"
    const ids = selectionParRectangle([6, 6], [0, 0], elements, calques);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b");
  });
});
