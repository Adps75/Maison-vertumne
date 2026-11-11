import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import { placerComposition, type PlanteAPlacer } from "../placement";
import { detecterConflits, type VoisineInfo } from "../../vegetaux/ecartement";

/**
 * Même règle que le panneau « Conflits » de l'application (detecterConflits, sans marge) :
 * une composition ne doit jamais y faire apparaître de conflit.
 */
const plante = (cle: string, o: Partial<PlanteAPlacer>): PlanteAPlacer => ({
  cle, rayon: 0.35, hauteur: 0.6, categorie: "vivace", forme: null,
  role: "masse", profondeur: "milieu", quantite: 9, tailleGroupe: 3, repetitions: 3, ...o,
});
const PALETTE: PlanteAPlacer[] = [
  // Palette de l'essai e2e où le panneau affichait un conflit (houx / gaura à la limite exacte)
  plante("houx", { categorie: "arbuste", forme: "boule", rayon: 0.35, hauteur: 1.2, role: "fond", profondeur: "fond", quantite: 4, tailleGroupe: 3, repetitions: 2 }),
  plante("perovskia", { rayon: 0.35, hauteur: 1.0, profondeur: "fond", quantite: 4 }),
  plante("gaura", { rayon: 0.21, hauteur: 0.8, profondeur: "milieu", quantite: 9 }),
  plante("sauge", { rayon: 0.175, hauteur: 0.5, profondeur: "devant", quantite: 9 }),
  plante("sesleria", { categorie: "graminee", rayon: 0.2, hauteur: 0.5, role: "masse", profondeur: "devant", quantite: 9, tailleGroupe: 3, repetitions: 3 }),
];

describe("composition : aucun conflit au sens du panneau Conflits", () => {
  for (let graine = 1; graine <= 200; graine++) {
    it(`graine ${graine}`, () => {
      const a = (graine * 0.37) % (2 * Math.PI);
      const rot = (x: number, y: number): Pt => [x * Math.cos(a) - y * Math.sin(a) + 13.7, x * Math.sin(a) + y * Math.cos(a) - 4.2];
      const contour: Pt[] = [rot(-3, -1.5), rot(3, -1.5), rot(3, 1.5), rot(-3, 1.5)];
      const r = placerComposition({ contour, plantes: PALETTE, versDevant: [Math.sin(a), -Math.cos(a)], geometrique: graine % 2 === 0, tolerance: 0.3, existantes: [], graine });
      const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
      const voisines: VoisineInfo[] = r.placements.map((pl, i) => {
        const p = parCle.get(pl.cle)!;
        return { id: `p${i}`, position: pl.position, rayon: p.rayon, categorie: p.categorie, forme: p.forme };
      });
      expect(detecterConflits(voisines, 0.3)).toEqual([]);
    });
  }
});
