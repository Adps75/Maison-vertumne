import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
const { rendreRepetable, consigneTexture } = await import("../texture");

describe("texture répétable", () => {
  it("bords opposés raccordés : la mosaïque n'a pas de couture", async () => {
    // Dégradé horizontal : sans traitement, le bord gauche (noir) et le droit (blanc) jureraient
    const n = 128;
    const brut = Buffer.alloc(n * n * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) brut.fill(Math.round((x / (n - 1)) * 255), (y * n + x) * 3, (y * n + x) * 3 + 3);
    const source = await sharp(brut, { raw: { width: n, height: n, channels: 3 } }).png().toBuffer();
    const sortie = await rendreRepetable(source, n);
    const { data } = await sharp(sortie).raw().toBuffer({ resolveWithObject: true });
    let ecartBords = 0, ecartSource = 0;
    for (let y = 0; y < n; y++) {
      ecartBords += Math.abs(data[(y * n) * 3] - data[(y * n + n - 1) * 3]);
      ecartSource += Math.abs(brut[(y * n) * 3] - brut[(y * n + n - 1) * 3]);
    }
    expect(ecartBords / n).toBeLessThan(12); // raccord (à la compression JPEG près)
    expect(ecartSource / n).toBeGreaterThan(200);
  });

  it("consigne : vue du dessus, sans ombre ni objet, à l'échelle réelle, description du matériau", () => {
    const c = consigneTexture({ description_ia: "paillage d'écorce de pin", texture_taille_m: 0.6 });
    expect(c).toMatch(/top-down/);
    expect(c).toMatch(/0\.6 m × 0\.6 m/);
    expect(c).toContain("paillage d'écorce de pin");
  });
});
