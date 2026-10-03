import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normaliserFace, normaliserDessus, genererSymbolePlan } from "../normalisation";

// Mock server-only
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

/** Crée une image PNG de test avec une zone opaque au centre. */
async function imageTest(w: number, h: number, marginTop = 20, marginLeft = 20): Promise<Buffer> {
  const innerW = w - marginLeft * 2;
  const innerH = h - marginTop * 2;

  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: await sharp({
        create: { width: innerW, height: innerH, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 255 } },
      }).png().toBuffer(),
      left: marginLeft,
      top: marginTop,
    }])
    .png()
    .toBuffer();
}

describe("normaliserFace", () => {
  it("supprime les marges transparentes", async () => {
    const img = await imageTest(200, 300, 50, 30);
    const { buffer } = await normaliserFace(img);
    const meta = await sharp(buffer).metadata();

    // L'image résultante doit être plus petite que l'originale
    expect(meta.width!).toBeLessThan(200);
    expect(meta.height!).toBeLessThan(300);
  });

  it("renvoie un ratio largeur/hauteur", async () => {
    const img = await imageTest(200, 400, 20, 20);
    const { ratioLargeurHauteur } = await normaliserFace(img);
    expect(ratioLargeurHauteur).toBeGreaterThan(0);
    expect(ratioLargeurHauteur).toBeLessThan(1); // Plus haut que large
  });
});

describe("normaliserDessus", () => {
  it("produit une image carrée", async () => {
    const img = await imageTest(300, 200, 20, 20);
    const result = await normaliserDessus(img);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(meta.height);
  });
});

describe("genererSymbolePlan", () => {
  it("génère un PNG carré", async () => {
    const result = await genererSymbolePlan("#4a7c59", 256);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });
});
