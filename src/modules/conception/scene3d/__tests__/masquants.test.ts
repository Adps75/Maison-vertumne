import { describe, it, expect } from "vitest";
import { primitivesMasquant, dansPrimitive, segmentTraverse } from "../masquants";
import type { Masquant3D } from "../types";

const IF: Masquant3D = { id: "if", position: [14, 4.5], altitudeRelative: 0.5, forme: "cone", hauteur_m: 4.5, diametre_m: 2, longueur_m: 2, orientation_deg: 0 };

describe("volumes masquants des végétaux existants", () => {
  it("cône posé sur le sol à l'altitude du pied, coordonnées 3D (z = -y)", () => {
    expect(primitivesMasquant(IF)).toEqual([{ type: "cone", centre: [14, 0.5 + 2.25, -4.5], rayon: 1, hauteur: 4.5 }]);
  });

  it("cône : large en bas, pointe en haut", () => {
    const [c] = primitivesMasquant(IF);
    expect(dansPrimitive([14.9, 0.6, -4.5], c)).toBe(true); // près du pied, au bord
    expect(dansPrimitive([14.9, 4.5, -4.5], c)).toBe(false); // même écart près de la pointe
    expect(dansPrimitive([14, 4.9, -4.5], c)).toBe(true); // axe, sous la pointe
  });

  it("boule (ellipsoïde), colonne, haie orientée, arbre (tronc + couronne)", () => {
    const base = { ...IF, altitudeRelative: 0 };
    const [boule] = primitivesMasquant({ ...base, forme: "boule", hauteur_m: 1, diametre_m: 1.2 });
    expect(boule).toEqual({ type: "ellipsoide", centre: [14, 0.5, -4.5], rayons: [0.6, 0.5, 0.6] });
    const [colonne] = primitivesMasquant({ ...base, forme: "colonne", hauteur_m: 3, diametre_m: 0.8 });
    expect(colonne).toMatchObject({ type: "cylindre", rayon: 0.4, hauteur: 3 });
    // Haie de 6 m orientée nord-sud (90°) : longue selon y plan, donc selon z en 3D
    const [haie] = primitivesMasquant({ ...base, forme: "haie", hauteur_m: 2, diametre_m: 0.8, longueur_m: 6, orientation_deg: 90 });
    expect(dansPrimitive([14, 1, -4.5 - 2.9], haie)).toBe(true);
    expect(dansPrimitive([14 + 2.9, 1, -4.5], haie)).toBe(false);
    const arbre = primitivesMasquant({ ...base, forme: "arbre", hauteur_m: 5.5, diametre_m: 3 });
    expect(arbre.map((p) => p.type)).toEqual(["cylindre", "ellipsoide"]);
    // Sous la couronne, à 1 m de l'axe : on voit à travers (pas de masque)
    expect(arbre.some((p) => dansPrimitive([15, 1, -4.5], p))).toBe(false);
    // Dans la couronne
    expect(arbre.some((p) => dansPrimitive([15, 4, -4.5], p))).toBe(true);
  });

  it("une plante derrière l'existant (vue de la caméra) est cachée, une plante devant ne l'est pas", () => {
    const prims = primitivesMasquant({ ...IF, altitudeRelative: 0 });
    // Caméra à l'est, à hauteur d'œil ; l'if à 14 m ; plantes à mi-hauteur (0,4 m)
    const camera: [number, number, number] = [24, 1.6, -4.5];
    const derriere: [number, number, number] = [11, 0.4, -4.5];
    const devant: [number, number, number] = [17, 0.4, -4.5];
    const aCote: [number, number, number] = [11, 0.4, -9];
    expect(segmentTraverse(camera, derriere, prims)).toBe(true);
    expect(segmentTraverse(camera, devant, prims)).toBe(false);
    expect(segmentTraverse(camera, aCote, prims)).toBe(false);
  });
});
