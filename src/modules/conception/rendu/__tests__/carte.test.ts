import { describe, it, expect } from "vitest";
import { creerImage } from "../image";
import { couleursPresentes, masqueCouleur, carteNonVide } from "../carte";

const ROUGE: [number, number, number] = [255, 0, 0];
const VERT: [number, number, number] = [0, 255, 0];

/** Carte 100 × 60 : massif (paillage, rouge) à gauche, gazon (vert) à droite, contigus. */
function carte() {
  const img = creerImage(100, 60);
  for (let y = 10; y < 50; y++) for (let x = 0; x < 100; x++) {
    const j = (y * 100 + x) * 4;
    const rgb = x < 50 ? ROUGE : x < 90 ? VERT : [0, 0, 0];
    img.donnees.set([...rgb, 255], j);
  }
  return img;
}

describe("carte des matériaux", () => {
  it("le masque du gazon n'inclut pas le massif (paillage) qui le touche", () => {
    const m = masqueCouleur(carte(), VERT);
    const v = (x: number, y: number) => m.valeurs[y * 100 + x];
    expect(v(60, 30)).toBe(255);
    expect(v(49, 30)).toBe(0); // dernier pixel du massif
    expect(v(50, 30)).toBe(255); // premier pixel du gazon
    expect(v(95, 30)).toBe(0); // noir : rien
    expect(v(60, 5)).toBe(0);
  });

  it("matériaux présents et leur surface en pixels ; couleur absente ignorée", () => {
    const p = couleursPresentes(carte(), [{ id: "paillage", rgb: ROUGE }, { id: "gazon", rgb: VERT }, { id: "gravier", rgb: [0, 0, 255] as [number, number, number] }]);
    expect(p.map((c) => [c.id, c.pixels])).toEqual([["paillage", 50 * 40], ["gazon", 40 * 40]]);
    expect(carteNonVide(carte())).toBe(true);
    expect(carteNonVide(creerImage(10, 10))).toBe(false);
  });
});
