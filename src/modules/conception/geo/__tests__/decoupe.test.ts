import { describe, it, expect } from "vitest";
import { decouperPolygone } from "../decoupe";
import { surface, type Pt } from "../plan";

const RECT: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];

describe("découpe d'une surface", () => {
  it("40 m² découpés en deux surfaces dont les aires font 40 m²", () => {
    const r = decouperPolygone(RECT, [[3, -1], [3, 5]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const aires = r.parties.map((p) => surface(p.points)).sort((x, y) => x - y);
    expect(aires[0]).toBeCloseTo(12, 9);
    expect(aires[1]).toBeCloseTo(28, 9);
    expect(aires[0] + aires[1]).toBeCloseTo(40, 9);
  });

  it("polyligne brisée : aires conservées, bord de coupe commun", () => {
    const r = decouperPolygone(RECT, [[2, -1], [2, 2], [7, 2], [7, 5]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.parties;
    expect(surface(a.points) + surface(b.points)).toBeCloseTo(40, 9);
    expect(surface(a.points)).toBeCloseTo(3 * 4 + 5 * 2, 9); // à droite de x = 7, et sous y = 2 entre x = 2 et 7
    expect(surface(b.points)).toBeCloseTo(2 * 4 + 5 * 2, 9);
  });

  it("contour concave (en L), coupe traversant le coude", () => {
    const L: Pt[] = [[0, 0], [12, 0], [12, 3], [4, 3], [4, 8], [0, 8]];
    const r = decouperPolygone(L, [[-1, 5], [5, 5]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const aires = r.parties.map((p) => surface(p.points)).sort((x, y) => x - y);
    expect(aires[0]).toBeCloseTo(12, 9); // 4 × 3 au-dessus de y = 5
    expect(aires[0] + aires[1]).toBeCloseTo(surface(L), 9);
  });

  it("provenance des côtés : les côtés d'origine sont suivis, la coupe vaut -1", () => {
    const r = decouperPolygone(RECT, [[3, -1], [3, 5]]);
    if (!r.ok) throw new Error(r.erreur);
    for (const p of r.parties) {
      expect(p.origines.length).toBe(p.points.length);
      expect(p.origines.filter((o) => o === -1).length).toBe(1);
      // Côté 1 (est) dans une seule partie, côté 3 (ouest) dans l'autre, 0 et 2 dans les deux
    }
    const avec = (cote: number) => r.parties.filter((p) => p.origines.includes(cote)).length;
    expect([avec(0), avec(1), avec(2), avec(3)]).toEqual([2, 1, 2, 1]);
  });

  it("ligne qui ne traverse pas, ou qui traverse plusieurs fois : message clair", () => {
    const r1 = decouperPolygone(RECT, [[3, 1], [3, 3]]);
    expect(r1).toEqual({ ok: false, erreur: "La ligne doit traverser la surface de part en part (deux croisements avec le contour)." });
    const r2 = decouperPolygone(RECT, [[2, -1], [2, 5], [6, 5], [6, -1]]);
    expect(r2.ok).toBe(false);
  });
});
