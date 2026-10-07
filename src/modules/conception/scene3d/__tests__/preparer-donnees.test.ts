import { describe, it, expect } from "vitest";
import { preparerDonneesScene, type ProjetPour3D } from "../preparer-donnees";
import type { Element } from "../../types";

const projetBase: ProjetPour3D = {
  parcelles_geojson: {
    type: "Polygon",
    coordinates: [[[0, 0], [30, 0], [30, 20], [0, 20], [0, 0]]],
  },
  batiments_geojson: [
    {
      geometry: {
        type: "Polygon",
        coordinates: [[[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]],
      },
      hauteur: 8,
      cleabs: "BAT001",
    },
  ],
  ortho_url: "https://example.com/ortho.jpg",
  ortho_emprise: [-5, -5, 35, 25],
};

function creerElement(partiel: Partial<Element> & Pick<Element, "id" | "type" | "geometrie">): Element {
  return {
    calque: "defaut",
    statut: "nouveau",
    hauteur: null,
    proprietes: {},
    ordre: 0,
    ...partiel,
  };
}

describe("preparerDonneesScene", () => {
  it("retourne les bâtiments filtrés dans l'emprise", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });

    const result = preparerDonneesScene(projetBase, [zone], "z1");

    expect(result.batiments).toHaveLength(1);
    expect(result.batiments[0].hauteur).toBe(8);
  });

  it("convertit les éléments sol en surfaces", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });
    const sol = creerElement({
      id: "s1",
      type: "sol",
      geometrie: { type: "polygone", points: [[2, 2], [10, 2], [10, 8], [2, 8]] },
      calque: "sols",
    });

    const result = preparerDonneesScene(projetBase, [zone, sol], "z1");

    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0].id).toBe("s1");
    expect(result.surfaces[0].couleur).toBe("#E07830");
  });

  it("convertit les éléments mineral en surfaces", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });
    const mineral = creerElement({
      id: "m1",
      type: "mineral",
      geometrie: { type: "rectangle", points: [[3, 3], [8, 3], [8, 6], [3, 6]] },
      calque: "mineral",
    });

    const result = preparerDonneesScene(projetBase, [zone, mineral], "z1");

    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0].couleur).toBe("#50B8E0");
  });

  it("convertit les cercles en polygones", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });
    const cercle = creerElement({
      id: "c1",
      type: "sol",
      geometrie: { type: "cercle", centre: [10, 10], rayon: 3 },
      calque: "sols",
    });

    const result = preparerDonneesScene(projetBase, [zone, cercle], "z1");

    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0].points.length).toBe(32);
  });

  it("convertit les végétaux avec URL d'image", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });
    const plante = creerElement({
      id: "v1",
      type: "vegetal",
      geometrie: { type: "point", position: [10, 10] },
      calque: "vegetal",
      hauteur: 3,
      proprietes: {
        plante_id: "plante-123",
        hauteur_m: 3,
        diametre_m: 1.5,
        version: "2025-06-01T00:00:00Z",
      },
    });

    const result = preparerDonneesScene(projetBase, [zone, plante], "z1");

    expect(result.vegetaux).toHaveLength(1);
    expect(result.vegetaux[0].plante_id).toBe("plante-123");
    expect(result.vegetaux[0].hauteur_m).toBe(3);
    expect(result.vegetaux[0].imageUrl).toContain("/api/conception/plantes/plante-123/image/face");
  });

  it("exclut les éléments hors de l'emprise", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [5, 0], [5, 5], [0, 5]] },
      calque: "zones",
    });
    const solDedans = creerElement({
      id: "s1",
      type: "sol",
      geometrie: { type: "polygone", points: [[1, 1], [4, 1], [4, 4], [1, 4]] },
      calque: "sols",
    });
    const solDehors = creerElement({
      id: "s2",
      type: "sol",
      geometrie: { type: "polygone", points: [[100, 100], [110, 100], [110, 110], [100, 110]] },
      calque: "sols",
    });

    const result = preparerDonneesScene(projetBase, [zone, solDedans, solDehors], "z1");

    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0].id).toBe("s1");
  });

  it("utilise la bbox de la parcelle quand il n'y a pas de zones", () => {
    const sol = creerElement({
      id: "s1",
      type: "sol",
      geometrie: { type: "polygone", points: [[5, 5], [10, 5], [10, 10], [5, 10]] },
      calque: "sols",
    });

    const result = preparerDonneesScene(projetBase, [sol]);

    // L'emprise doit couvrir au moins la parcelle
    expect(result.emprise[0]).toBeLessThanOrEqual(0);
    expect(result.emprise[2]).toBeGreaterThanOrEqual(30);
    expect(result.surfaces).toHaveLength(1);
  });

  it("ignore les types non visuels (cote, annotation, limite)", () => {
    const zone = creerElement({
      id: "z1",
      type: "zone",
      geometrie: { type: "polygone", points: [[0, 0], [30, 0], [30, 20], [0, 20]] },
      calque: "zones",
    });
    const cote = creerElement({
      id: "c1",
      type: "cote",
      geometrie: { type: "cote", p1: [0, 0], p2: [10, 0], decalage: 1, distance: 10 },
      calque: "cotes",
    });
    const annotation = creerElement({
      id: "a1",
      type: "annotation",
      geometrie: { type: "point", position: [5, 5] },
      calque: "annotations",
    });

    const result = preparerDonneesScene(projetBase, [zone, cote, annotation], "z1");

    expect(result.surfaces).toHaveLength(0);
    expect(result.vegetaux).toHaveLength(0);
  });

  it("passe l'URL et l'emprise de l'orthophoto", () => {
    const result = preparerDonneesScene(projetBase, []);

    expect(result.orthoUrl).toBe("https://example.com/ortho.jpg");
    expect(result.orthoEmprise).toEqual([-5, -5, 35, 25]);
  });
});
