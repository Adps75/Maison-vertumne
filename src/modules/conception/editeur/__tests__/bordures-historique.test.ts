import { describe, it, expect, beforeEach } from "vitest";
import { reducer, etatInitial, reinitialiserHistoriques, viderChangements, getChangements } from "../reducer";
import type { Element } from "../../types";
import type { Pt } from "../../geo/plan";
import { creerBordures } from "../../materiaux/bordures";

let n = 0;
const genererId = () => `x${n++}`;
const surface = (points: Pt[]): Element => ({
  id: "s", type: "sol", geometrie: { type: "rectangle", points }, calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 0,
});
const RECT: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
const longueur = (el: Element) => {
  const p = (el.geometrie as { points: Pt[] }).points;
  return p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
};

function avecBordure() {
  let e = reducer(etatInitial(), { type: "CREER_ELEMENT", element: surface(RECT) });
  const r = creerBordures({ surface: e.elements.get("s")!, cotes: [0, 1], materiauId: "volige", existants: e.elements.values(), genererId, ordre: 1 });
  if (!r.ok) throw new Error(r.erreur);
  e = reducer(e, { type: "MODIFIER_ELEMENTS", elements: r.elements });
  return { e, idBordure: r.elements[0].id };
}

describe("bordures dans l'historique de l'éditeur", () => {
  beforeEach(() => { reinitialiserHistoriques(); viderChangements(); n = 0; });

  it("contour modifié : la bordure suit dans la même action, Cmd+Z restaure les deux", () => {
    const { e: e0, idBordure } = avecBordure();
    expect(longueur(e0.elements.get(idBordure)!)).toBeCloseTo(14, 9);
    let e = reducer(e0, { type: "MODIFIER_ELEMENTS", elements: [surface([[0, 0], [12, 0], [12, 4], [0, 4]])] });
    expect(longueur(e.elements.get(idBordure)!)).toBeCloseTo(16, 9);
    e = reducer(e, { type: "ANNULER" });
    expect(longueur(e.elements.get(idBordure)!)).toBeCloseTo(14, 9);
    expect((e.elements.get("s")!.geometrie as { points: Pt[] }).points).toEqual(RECT);
  });

  it("sommet inséré : côtés renumérotés via changementsContour", () => {
    const { e: e0, idBordure } = avecBordure();
    const e = reducer(e0, {
      type: "MODIFIER_ELEMENTS", elements: [surface([[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]])],
      changementsContour: { s: { type: "insertion", cote: 0 } },
    });
    expect(e.elements.get(idBordure)!.proprietes.cotes).toEqual([0, 1, 2]);
    expect(longueur(e.elements.get(idBordure)!)).toBeCloseTo(14, 9);
  });

  it("supprimer la surface supprime ses bordures ; Cmd+Z les restaure", () => {
    const { e: e0, idBordure } = avecBordure();
    let e = reducer(e0, { type: "SELECTIONNER", ids: ["s"] });
    viderChangements();
    e = reducer(e, { type: "SUPPRIMER_SELECTION" });
    expect(e.elements.size).toBe(0);
    expect(getChangements().suppressions.sort()).toEqual([idBordure, "s"].sort());
    e = reducer(e, { type: "ANNULER" });
    expect([...e.elements.keys()].sort()).toEqual([idBordure, "s"].sort());
  });

  it("création de bordure annulable : Cmd+Z la retire (suppression enregistrée)", () => {
    const { e: e0, idBordure } = avecBordure();
    viderChangements();
    const e = reducer(e0, { type: "ANNULER" });
    expect(e.elements.has(idBordure)).toBe(false);
    expect(getChangements().suppressions).toContain(idBordure);
  });
});
