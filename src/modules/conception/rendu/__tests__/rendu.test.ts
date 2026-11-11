import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { creerImage, creerMasque, superposer, depremultiplier, retournerVerticalement, type ImageRGBA, type Masque } from "../image";
import {
  fusionnerMasqueBrut, masqueFinal, distanceAuMasque, boiteEnglobante, masquePourApi,
  ELARGISSEMENT_PX, largeurTransition,
} from "../masque";
import { tailleModele, recadrageAutour, PIXELS_MIN_MODELE, COTE_MAX_MODELE } from "../recadrage";
import { recoller } from "../recollage";
import { filtreDessin } from "../filtre-dessin";
import { estimerCoutEdition } from "../cout";
import { rendreRealiste, rendreDessinIA, rendreDessinFiltre, decoder, encoderPng, type Editeur } from "../pipeline";

// ─── Scène synthétique ────────────────────────────────────────────────
// Photo 400×300 : ciel en haut (y < 120), maison à gauche (x 20–140, y 60–200),
// pelouse en bas. Massif au sol : rectangle x 220–320, y 200–260.
// Une plante dans le massif (x 250–280, y 150–240) projette une ombre vers la
// droite, HORS du contour du massif (x 330–370, y 235–250).

const L = 400, H = 300;
const MAISON = { x0: 20, y0: 60, x1: 140, y1: 200 };
const MASSIF = { x0: 220, y0: 200, x1: 320, y1: 260 };
const PLANTE = { x0: 250, y0: 150, x1: 280, y1: 240 };
const OMBRE = { x0: 330, y0: 235, x1: 370, y1: 250 };

function photo(): ImageRGBA {
  const img = creerImage(L, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const i = (y * L + x) * 4;
    const maison = x >= MAISON.x0 && x < MAISON.x1 && y >= MAISON.y0 && y < MAISON.y1;
    const [r, g, b] = maison ? [200, 190, 170] : y < 120 ? [135, 206, 235] : [40 + (x % 7), 140 + (y % 5), 40];
    img.donnees[i] = r; img.donnees[i + 1] = g; img.donnees[i + 2] = b; img.donnees[i + 3] = 255;
  }
  return img;
}

/** Couche 3D : plante opaque + ombre semi-transparente au sol (alpha non prémultiplié). */
function couche(): ImageRGBA {
  const img = creerImage(L, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const i = (y * L + x) * 4;
    if (x >= PLANTE.x0 && x < PLANTE.x1 && y >= PLANTE.y0 && y < PLANTE.y1) {
      img.donnees[i] = 30; img.donnees[i + 1] = 120; img.donnees[i + 2] = 50; img.donnees[i + 3] = 255;
    } else if (x >= OMBRE.x0 && x < OMBRE.x1 && y >= OMBRE.y0 && y < OMBRE.y1) {
      img.donnees[i + 3] = 100; // ombre : noir à 40 %
    }
  }
  return img;
}

/** Masque rendu par la scène : silhouettes des végétaux + massif au sol (maison occultée). */
function masqueScene(): Masque {
  const m = creerMasque(L, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const dansMassif = x >= MASSIF.x0 && x < MASSIF.x1 && y >= MASSIF.y0 && y < MASSIF.y1;
    const dansPlante = x >= PLANTE.x0 && x < PLANTE.x1 && y >= PLANTE.y0 && y < PLANTE.y1;
    if (dansMassif || dansPlante) m.valeurs[y * L + x] = 255;
  }
  return m;
}

const val = (m: Masque, x: number, y: number) => m.valeurs[y * m.largeur + x];

describe("masque", () => {
  const final = masqueFinal(fusionnerMasqueBrut(masqueScene(), couche()));

  it("contient les végétaux et le massif", () => {
    expect(val(final, 265, 160)).toBe(255); // haut de la plante
    expect(val(final, 265, 239)).toBe(255); // pied de la plante
    expect(val(final, 225, 255)).toBe(255); // coin du massif
  });

  it("contient l'ombre projetée hors du contour du massif", () => {
    // L'ombre est à droite du massif (x ≥ 330 > 320) : elle vient de la couche 3D
    expect(val(final, 350, 242)).toBe(255);
    expect(val(final, 369, 249)).toBe(255);
  });

  it("exclut le ciel et la maison", () => {
    expect(val(final, 200, 10)).toBe(0); // ciel
    expect(val(final, 390, 20)).toBe(0); // ciel
    expect(val(final, 80, 130)).toBe(0); // maison
    expect(val(final, 135, 195)).toBe(0); // coin de la maison le plus proche du massif
  });

  it("élargi de 30 px, puis transition progressive, puis 0", () => {
    const T = largeurTransition(L, H);
    // À gauche du massif (premier pixel x = 220), ligne y = 255 (rien d'autre à proximité)
    const bord = MASSIF.x0, y = 255;
    expect(val(final, bord - ELARGISSEMENT_PX, y)).toBe(255);
    const milieu = val(final, bord - ELARGISSEMENT_PX - Math.round(T / 2), y);
    expect(milieu).toBeGreaterThan(40);
    expect(milieu).toBeLessThan(215);
    expect(val(final, bord - ELARGISSEMENT_PX - T - 1, y)).toBe(0);
    // Décroissance monotone dans la transition
    let prec = 255;
    for (let x = bord - ELARGISSEMENT_PX; x >= bord - ELARGISSEMENT_PX - T - 1; x--) {
      expect(val(final, x, y)).toBeLessThanOrEqual(prec);
      prec = val(final, x, y);
    }
  });

  it("distance euclidienne exacte", () => {
    const m = creerMasque(50, 50);
    m.valeurs[25 * 50 + 25] = 255;
    const d = distanceAuMasque(m);
    expect(d[25 * 50 + 25]).toBe(0);
    expect(d[25 * 50 + 28]).toBeCloseTo(3, 5);
    expect(d[29 * 50 + 28]).toBeCloseTo(5, 5); // 3-4-5
  });

  it("format API : transparent = à modifier", () => {
    const api = masquePourApi(final);
    const alpha = (x: number, y: number) => api.donnees[(y * L + x) * 4 + 3];
    expect(alpha(265, 200)).toBe(0);
    expect(alpha(200, 10)).toBe(255);
  });

  it("boîte englobante", () => {
    expect(boiteEnglobante(creerMasque(10, 10))).toBeNull();
    const b = boiteEnglobante(masqueScene())!;
    expect(b).toEqual({ x: 220, y: 150, largeur: 100, hauteur: 110 });
  });
});

describe("recadrage et tailles du modèle", () => {
  it("tailles multiples de 16, rapport ≤ 3, pixels ≥ minimum, côté ≤ maximum", () => {
    for (const [l, h] of [[100, 80], [4000, 3000], [3000, 4000], [5000, 1000], [600, 2400], [1024, 1024]]) {
      const t = tailleModele(l, h);
      expect(t.largeur % 16).toBe(0);
      expect(t.hauteur % 16).toBe(0);
      expect(t.largeur * t.hauteur).toBeGreaterThanOrEqual(PIXELS_MIN_MODELE);
      expect(Math.max(t.largeur, t.hauteur)).toBeLessThanOrEqual(COTE_MAX_MODELE);
      expect(Math.max(t.largeur / t.hauteur, t.hauteur / t.largeur)).toBeLessThanOrEqual(3.01);
    }
  });

  it("proportions conservées à l'arrondi près", () => {
    const t = tailleModele(4000, 3000);
    expect(t.largeur / t.hauteur).toBeCloseTo(4 / 3, 1);
    expect(t.largeur).toBe(2048);
  });

  it("recadrage avec marge, dans l'image", () => {
    const r = recadrageAutour({ x: 220, y: 150, largeur: 100, hauteur: 110 }, L, H);
    expect(r.x).toBeLessThanOrEqual(220 - 64);
    expect(r.x + r.largeur).toBeLessThanOrEqual(L);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.hauteur).toBeLessThanOrEqual(H);
  });

  it("recadrage très allongé ramené à 3:1 au plus", () => {
    const r = recadrageAutour({ x: 500, y: 1000, largeur: 2000, hauteur: 20 }, 4000, 3000);
    expect(r.largeur / r.hauteur).toBeLessThanOrEqual(3.01);
  });
});

describe("recollage", () => {
  it("pixels hors masque strictement identiques à l'original", () => {
    const original = photo();
    const masque = masqueFinal(fusionnerMasqueBrut(masqueScene(), couche()));
    const rect = { x: 150, y: 100, largeur: 250, hauteur: 200 };
    const resultat = creerImage(rect.largeur, rect.hauteur);
    resultat.donnees.fill(255); // résultat IA tout blanc, y compris hors masque
    const final = recoller(original, resultat, rect, masque);

    let horsMasque = 0, horsDifferents = 0, dansMasque = 0, dansNonBlancs = 0;
    for (let i = 0; i < L * H; i++) {
      if (masque.valeurs[i] === 0) {
        horsMasque++;
        for (let c = 0; c < 4; c++) {
          if (final.donnees[i * 4 + c] !== original.donnees[i * 4 + c]) { horsDifferents++; break; }
        }
      } else if (masque.valeurs[i] === 255) {
        dansMasque++;
        if (final.donnees[i * 4] !== 255) dansNonBlancs++;
      }
    }
    expect(horsDifferents).toBe(0); // strictement identiques
    expect(horsMasque).toBeGreaterThan(L * H / 2);
    expect(dansMasque).toBeGreaterThan(1000);
    expect(dansNonBlancs).toBe(0);
  });

  it("fondu dans la transition : entre l'original et le résultat", () => {
    const original = creerImage(10, 1); original.donnees.fill(0);
    for (let i = 3; i < 40; i += 4) original.donnees[i] = 255;
    const res = creerImage(10, 1); res.donnees.fill(200);
    const m = creerMasque(10, 1); m.valeurs[5] = 128;
    const out = recoller(original, res, { x: 0, y: 0, largeur: 10, hauteur: 1 }, m);
    expect(out.donnees[5 * 4]).toBe(Math.round(200 * 128 / 255));
    expect(out.donnees[4 * 4]).toBe(0);
  });
});

describe("filtre dessin sans IA", () => {
  it("dimensions conservées, image opaque et modifiée", () => {
    const src = photo();
    const out = filtreDessin(src);
    expect(out.largeur).toBe(L);
    expect(out.hauteur).toBe(H);
    expect(out.donnees.length).toBe(src.donnees.length);
    let differents = 0;
    let nonOpaques = 0;
    for (let i = 0; i < out.donnees.length; i += 4) {
      if (out.donnees[i + 3] !== 255) nonOpaques++;
      if (out.donnees[i] !== src.donnees[i]) differents++;
    }
    expect(nonOpaques).toBe(0);
    expect(differents).toBeGreaterThan(L * H / 4);
  });

  it("contour de la maison tracé à l'encre (plus sombre que ses deux côtés)", () => {
    const out = filtreDessin(photo());
    const lum = (x: number, y: number) => {
      const i = (y * L + x) * 4;
      return out.donnees[i] + out.donnees[i + 1] + out.donnees[i + 2];
    };
    expect(lum(MAISON.x1, 130)).toBeLessThan(lum(MAISON.x1 - 10, 130));
    expect(lum(MAISON.x1, 130)).toBeLessThan(lum(MAISON.x1 + 10, 130));
  });
});

describe("image : superposition et lecture WebGL", () => {
  it("superposer : couche transparente → photo, opaque → couche, ombre → assombrie", () => {
    const out = superposer(photo(), couche());
    const px = (x: number, y: number) => Array.from(out.donnees.slice((y * L + x) * 4, (y * L + x) * 4 + 3));
    expect(px(10, 10)).toEqual([135, 206, 235]);
    expect(px(265, 200)).toEqual([30, 120, 50]);
    expect(px(350, 240)[1]).toBeLessThan(140);
  });

  it("dé-prémultiplication et retournement", () => {
    const d = new Uint8Array([50, 25, 0, 128, 10, 20, 30, 255]);
    depremultiplier(d);
    expect(Array.from(d.slice(0, 4))).toEqual([100, 50, 0, 128]);
    const r = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2]);
    retournerVerticalement(r, 1, 2);
    expect(Array.from(r)).toEqual([2, 2, 2, 2, 1, 1, 1, 1]);
  });
});

describe("coût estimé", () => {
  it("proportionnel à la taille", () => {
    const petit = estimerCoutEdition(1024, 1024);
    const grand = estimerCoutEdition(2048, 1536);
    expect(petit).toBeGreaterThan(0.1);
    expect(petit).toBeLessThan(0.5);
    expect(grand).toBeCloseTo(petit * 3, 1);
  });
});

// ─── Chaîne complète avec un fournisseur simulé ─────────────────────────

/** Fournisseur simulé : renvoie l'image reçue, couleurs inversées, à la taille demandée. */
function fournisseurSimule() {
  return vi.fn<Editeur>(async (_consigne, imagePng, { taille }) => {
    const [l, h] = taille.split("x").map(Number);
    const buffer = await sharp(imagePng).resize(l, h, { fit: "fill" }).negate({ alpha: false }).png().toBuffer();
    return { buffer, usage: { input_tokens: 1000, output_tokens: 4000 } };
  });
}

describe("chaîne de rendu avec fournisseur simulé", () => {
  it("réaliste : un appel, image et masque de même taille acceptée, hors masque identique", async () => {
    const editer = fournisseurSimule();
    const original = photo();
    const r = await rendreRealiste({ photo: original, couche: couche(), masqueScene: masqueScene(), editer });

    expect(editer).toHaveBeenCalledTimes(1);
    const [consigne, imagePng, options] = editer.mock.calls[0];
    expect(consigne).toMatch(/Edit ONLY the transparent/);
    const meta = await sharp(imagePng).metadata();
    const metaMasque = await sharp(options.masquePng!).metadata();
    expect(`${meta.width}x${meta.height}`).toBe(options.taille);
    expect(`${metaMasque.width}x${metaMasque.height}`).toBe(options.taille);
    expect(metaMasque.channels).toBe(4); // canal alpha
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);

    // Taille d'origine, et pixels hors masque identiques à la photo
    expect(r.image.largeur).toBe(L);
    expect(r.image.hauteur).toBe(H);
    let modifies = 0, horsDifferents = 0;
    for (let i = 0; i < L * H; i++) {
      const j = i * 4;
      if (r.masque!.valeurs[i] === 0) {
        if (r.image.donnees[j] !== original.donnees[j] || r.image.donnees[j + 1] !== original.donnees[j + 1]
          || r.image.donnees[j + 2] !== original.donnees[j + 2]) horsDifferents++;
      } else if (r.image.donnees[j] !== original.donnees[j]) modifies++;
    }
    expect(horsDifferents).toBe(0);
    expect(modifies).toBeGreaterThan(1000);
  });

  it("réaliste : vue sans végétal ni massif → erreur explicite, aucun appel", async () => {
    const editer = fournisseurSimule();
    await expect(rendreRealiste({
      photo: photo(), couche: creerImage(L, H), masqueScene: creerMasque(L, H), editer,
    })).rejects.toThrow(/Aucun végétal/);
    expect(editer).not.toHaveBeenCalled();
  });

  it("dessin avec IA : toute la vue envoyée sans masque, résultat à pleine résolution", async () => {
    const editer = fournisseurSimule();
    const r = await rendreDessinIA({ photo: photo(), couche: couche(), editer });
    expect(editer).toHaveBeenCalledTimes(1);
    expect(editer.mock.calls[0][2].masquePng).toBeUndefined();
    expect(r.image.largeur).toBe(L);
    expect(r.image.hauteur).toBe(H);
  });

  it("dessin sans IA : aucun appel, dimensions conservées", async () => {
    const r = await rendreDessinFiltre({ photo: photo(), couche: couche() });
    expect(r.image.largeur).toBe(L);
    expect(r.image.hauteur).toBe(H);
    expect(r.usage).toBeNull();
  });

  it("encodage PNG aller-retour sans perte", async () => {
    const src = photo();
    const back = await decoder(await encoderPng(src));
    expect(back.largeur).toBe(L);
    expect(Buffer.from(back.donnees).equals(Buffer.from(src.donnees))).toBe(true);
  });
});
