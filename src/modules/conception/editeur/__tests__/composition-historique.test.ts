import { describe, it, expect, beforeEach } from "vitest";
import { reducer, etatInitial, reinitialiserHistoriques, getChangements, viderChangements } from "../reducer";
import type { Element } from "../../types";

const plante = (id: string, composition: string | null, x: number): Element => ({
  id, type: "vegetal", calque: "vegetal", statut: "nouveau", hauteur: 0.6, ordre: 0,
  geometrie: { type: "point", position: [x, 1] },
  proprietes: { plante_id: "p", composition_id: composition },
});

describe("APPLIQUER_COMPOSITION : une seule action annulable", () => {
  beforeEach(() => { reinitialiserHistoriques(); viderChangements(); });

  it("ajoute les plantes, Cmd+Z retire tout, Cmd+Maj+Z rétablit tout", () => {
    let e = reducer(etatInitial(), { type: "CREER_ELEMENT", element: plante("main", null, 0) });
    const ajouts = [plante("a", "c1", 1), plante("b", "c1", 2), plante("c", "c1", 3)];
    e = reducer(e, { type: "APPLIQUER_COMPOSITION", ajouts, suppressions: [] });
    expect([...e.elements.keys()].sort()).toEqual(["a", "b", "c", "main"]);

    viderChangements();
    e = reducer(e, { type: "ANNULER" });
    expect([...e.elements.keys()]).toEqual(["main"]); // la plante posée à la main reste
    expect(getChangements().suppressions.sort()).toEqual(["a", "b", "c"]);

    e = reducer(e, { type: "RETABLIR" });
    expect([...e.elements.keys()].sort()).toEqual(["a", "b", "c", "main"]);
  });

  it("remplacement d'une composition : annuler restaure l'ancienne en une fois", () => {
    let e = reducer(etatInitial(), { type: "APPLIQUER_COMPOSITION", ajouts: [plante("v1", "c1", 1), plante("v2", "c1", 2)], suppressions: [] });
    e = reducer(e, { type: "CREER_ELEMENT", element: plante("main", null, 5) });
    e = reducer(e, { type: "APPLIQUER_COMPOSITION", ajouts: [plante("n1", "c2", 1)], suppressions: ["v1", "v2"] });
    expect([...e.elements.keys()].sort()).toEqual(["main", "n1"]);

    viderChangements();
    e = reducer(e, { type: "ANNULER" });
    expect([...e.elements.keys()].sort()).toEqual(["main", "v1", "v2"]);
    expect(getChangements().suppressions).toContain("n1");
    expect(getChangements().upserts.map((x) => x.id).sort()).toEqual(["v1", "v2"]);
  });
});
