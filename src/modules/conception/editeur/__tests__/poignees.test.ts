import { describe, it, expect } from "vitest";
import {
  extrairePoignees,
  appliquerDeplacementPoignee,
  supprimerSommet,
} from "../poignees";
import type { Element, GeometriePolygone, GeometrieCercle } from "../../types";

function polygone(pts: [number, number][]): Element {
  return {
    id: "test-poly",
    type: "sol",
    geometrie: { type: "polygone", points: pts },
    calque: "defaut",
    statut: "nouveau",
    hauteur: null,
    proprietes: {},
    ordre: 0,
  };
}

function cercle(cx: number, cy: number, r: number): Element {
  return {
    id: "test-cercle",
    type: "sol",
    geometrie: { type: "cercle", centre: [cx, cy], rayon: r },
    calque: "defaut",
    statut: "nouveau",
    hauteur: null,
    proprietes: {},
    ordre: 0,
  };
}

describe("extrairePoignees", () => {
  it("polygone : sommets + milieux", () => {
    const el = polygone([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const poignees = extrairePoignees(el);
    const sommets = poignees.filter((p) => p.type === "sommet");
    const milieux = poignees.filter((p) => p.type === "milieu");
    expect(sommets).toHaveLength(4);
    expect(milieux).toHaveLength(4);
  });

  it("cercle : centre + rayon", () => {
    const el = cercle(5, 5, 3);
    const poignees = extrairePoignees(el);
    expect(poignees.find((p) => p.type === "centre")).toBeTruthy();
    expect(poignees.find((p) => p.type === "rayon")).toBeTruthy();
    expect(poignees.find((p) => p.type === "rayon")!.point).toEqual([8, 5]);
  });
});

describe("appliquerDeplacementPoignee", () => {
  it("déplace un sommet de polygone", () => {
    const geom: GeometriePolygone = { type: "polygone", points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
    const result = appliquerDeplacementPoignee(
      geom,
      { elementId: "x", type: "sommet", index: 1, point: [10, 0] },
      [12, 0],
    );
    expect(result).not.toBeNull();
    expect((result as GeometriePolygone).points[1]).toEqual([12, 0]);
  });

  it("ajoute un sommet par poignée milieu", () => {
    const geom: GeometriePolygone = { type: "polygone", points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
    const result = appliquerDeplacementPoignee(
      geom,
      { elementId: "x", type: "milieu", index: 0, point: [5, 0] },
      [5, -2],
    );
    expect(result).not.toBeNull();
    expect((result as GeometriePolygone).points).toHaveLength(5);
    expect((result as GeometriePolygone).points[1]).toEqual([5, -2]);
  });

  it("modifie le rayon d'un cercle", () => {
    const geom: GeometrieCercle = { type: "cercle", centre: [5, 5], rayon: 3 };
    const result = appliquerDeplacementPoignee(
      geom,
      { elementId: "x", type: "rayon", index: 0, point: [8, 5] },
      [10, 5],
    );
    expect(result).not.toBeNull();
    expect((result as GeometrieCercle).rayon).toBeCloseTo(5);
  });
});

describe("supprimerSommet", () => {
  it("supprime un sommet d'un polygone de 5 sommets", () => {
    const geom: GeometriePolygone = {
      type: "polygone",
      points: [[0, 0], [10, 0], [10, 10], [5, 12], [0, 10]],
    };
    const result = supprimerSommet(geom, 2);
    expect(result).not.toBeNull();
    expect((result as GeometriePolygone).points).toHaveLength(4);
  });

  it("refuse de supprimer si le polygone aurait moins de 3 sommets", () => {
    const geom: GeometriePolygone = {
      type: "polygone",
      points: [[0, 0], [10, 0], [10, 10]],
    };
    const result = supprimerSommet(geom, 0);
    expect(result).toBeNull();
  });

  it("refuse de supprimer un sommet de cercle", () => {
    const geom: GeometrieCercle = { type: "cercle", centre: [5, 5], rayon: 3 };
    const result = supprimerSommet(geom, 0);
    expect(result).toBeNull();
  });
});
