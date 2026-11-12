import { describe, it, expect } from "vitest";
import { empreinteAnalyse, type DonneesEmpreinte } from "../empreinte";

const base: DonneesEmpreinte = {
  contour: [[0, 0], [4, 0], [4, 3], [0, 3]],
  vues: [{ id: "v1", camera: { x: 1, y: -6, hauteur: 1.6, cap: 0, inclinaison: -5, roulis: 0, fov_v: 48 } }],
  existant: [{ id: "e1", position: [2, 1], diametre: 1 }],
};

describe("empreinte de l'analyse", () => {
  it("stable, et indépendante de l'ordre des vues et de l'existant", () => {
    const a = empreinteAnalyse(base);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(empreinteAnalyse({ ...base })).toBe(a);
    const deux = { ...base, vues: [...base.vues, { id: "v0", camera: base.vues[0].camera }] };
    expect(empreinteAnalyse({ ...deux, vues: [...deux.vues].reverse() })).toBe(empreinteAnalyse(deux));
  });
  it("change si le contour, une vue calée ou l'existant change", () => {
    const a = empreinteAnalyse(base);
    expect(empreinteAnalyse({ ...base, contour: [[0, 0], [4.5, 0], [4, 3], [0, 3]] })).not.toBe(a);
    expect(empreinteAnalyse({ ...base, vues: [{ ...base.vues[0], camera: { ...base.vues[0].camera, cap: 2 } }] })).not.toBe(a);
    expect(empreinteAnalyse({ ...base, existant: [] })).not.toBe(a);
  });
  it("insensible aux variations sous le centimètre", () => {
    expect(empreinteAnalyse({ ...base, contour: [[0.001, 0], [4, 0], [4, 3], [0, 3]] })).toBe(empreinteAnalyse(base));
  });
});
