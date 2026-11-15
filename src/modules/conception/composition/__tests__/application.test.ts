import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import { placerComposition } from "../placement";
import {
  plantesAPlacer, toleranceDensite, elementsComposition, plantesCompositionExistante, plantesAbsentes, messagePlantesAbsentes, type PlanteComposee,
} from "../application";
import type { Intention } from "../schemas";
import type { Element } from "../../types";

const PLANTES: PlanteComposee[] = [
  { id: "cornus", nom_commun: "Cornouiller", nom_latin: "Cornus alba", categorie: "arbuste", forme: "boule", hauteur_adulte_m: 2, largeur_adulte_m: 1.5, largeur_3ans_m: 1.0 },
  { id: "salvia", nom_commun: "Sauge", nom_latin: "Salvia nemorosa", categorie: "vivace", forme: "touffe", hauteur_adulte_m: 0.5, largeur_adulte_m: 0.5, largeur_3ans_m: null },
];

const INTENTION: Intention = {
  plantes: [
    { plante_id: "cornus", role: "structure", part_surface: null, nombre: 3, profondeur: "fond", taille_groupe: 1, repetitions: 3 },
    { plante_id: "salvia", role: "masse", part_surface: 100, nombre: null, profondeur: "devant", taille_groupe: 4, repetitions: 2 },
    { plante_id: "inconnue", role: "masse", part_surface: 20, nombre: null, profondeur: "milieu", taille_groupe: 3, repetitions: 1 },
  ],
  geometrie: null,
  explication: "",
};

describe("application d'une composition", () => {
  it("plantes à placer : rayon à 3 ans (ou 70 % adulte), groupe impair, nombre fixe ou part, plante inconnue ignorée", () => {
    const p = plantesAPlacer(INTENTION, PLANTES);
    expect(p.map((x) => x.cle)).toEqual(["cornus", "salvia"]);
    expect(p[0]).toMatchObject({ nombre: 3, part: 0 });
    expect(p[1]).toMatchObject({ nombre: null, part: 1 });
    expect(p[0].rayon).toBeCloseTo(0.5);
    expect(p[1].rayon).toBeCloseTo(0.175);
    expect(p[1].tailleGroupe).toBe(3);
  });

  it("plantes de la palette absentes de la bibliothèque, message clair", () => {
    expect(plantesAbsentes(PLANTES, ["salvia"])).toEqual([PLANTES[0]]);
    expect(plantesAbsentes(PLANTES, ["salvia", "cornus"])).toEqual([]);
    expect(messagePlantesAbsentes([PLANTES[0]])).toBe("Cornouiller n'existe plus dans la bibliothèque : relancez la composition avec une palette à jour.");
    expect(messagePlantesAbsentes(PLANTES)).toContain("Cornouiller, Sauge n'existent plus");
  });

  it("tolérance selon la densité, bornée", () => {
    expect(toleranceDensite(0.3, "serree")).toBe(0.4);
    expect(toleranceDensite(0.35, "serree")).toBe(0.4);
    expect(toleranceDensite(0.3, "aeree")).toBe(0.2);
    expect(toleranceDensite(0.05, "aeree")).toBe(0);
    expect(toleranceDensite(0.3, "standard")).toBe(0.3);
  });

  it("éléments : une plante du plan par placement, nombre fixe respecté, marqués par la composition", () => {
    const contour: Pt[] = [[0, 0], [8, 0], [8, 4], [0, 4]];
    const r = placerComposition({ contour, plantes: plantesAPlacer(INTENTION, PLANTES), versDevant: [0, -1], geometrique: false, tolerance: 0.3, densite: "standard", existantes: [], graine: 3 });
    let n = 0;
    const els = elementsComposition({ placements: r.placements, plantes: PLANTES, compositionId: "c1", contourId: "z1", ordreBase: 10, genererId: () => `e${n++}` });
    expect(els.length).toBe(r.placements.length);
    expect(els.filter((e) => e.proprietes.plante_id === "cornus").length).toBe(3);
    expect(els.filter((e) => e.proprietes.plante_id === "salvia").length).toBe(r.placements.length - 3);
    expect(r.couverture).toBeGreaterThanOrEqual(0.85);
    for (const e of els) {
      expect(e.type).toBe("vegetal");
      expect(e.calque).toBe("vegetal");
      expect(e.proprietes.composition_id).toBe("c1");
      expect(e.proprietes.composition_contour).toBe("z1");
    }
    expect(els[0].ordre).toBe(10);
  });

  it("composition existante du même contour retrouvée, plantes posées à la main ignorées", () => {
    const v = (id: string, props: Record<string, unknown>): Element => ({
      id, type: "vegetal", calque: "vegetal", statut: "nouveau", hauteur: 1, ordre: 0,
      geometrie: { type: "point", position: [1, 1] }, proprietes: props,
    });
    const els = [
      v("a", { composition_id: "c1", composition_contour: "z1" }),
      v("b", { composition_id: "c1", composition_contour: "z1" }),
      v("main", {}),
      v("autre", { composition_id: "c2", composition_contour: "z2" }),
    ];
    expect(plantesCompositionExistante(els, "z1")).toEqual(["a", "b"]);
  });
});
