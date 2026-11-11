/**
 * Tests E2E — Rendu IA des vues, avec le fournisseur d'image simulé
 * (FOURNISSEUR_IMAGE=simule : aucun appel à OpenAI).
 *
 * Lancer : FOURNISSEUR_IMAGE=simule PORT=3001 npx playwright test e2e/rendu-ia.spec.ts
 * (sur un port sans serveur déjà lancé, pour que le serveur de test reçoive la variable).
 *
 * Captures : e2e/screenshots/rendu-panneau-realiste.png, rendu-panneau-dessin.png,
 * rendu-progression.png, rendu-liste.png.
 */

import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

test.use({ storageState: "e2e/.auth/state.json" });

let projetId: string | null = null;
let pdvId: string | null = null;
const MASSIF_ID = crypto.randomUUID();
let massif: { cx: number; cy: number; demi: number } | null = null;
const PHOTO = { l: 800, h: 600 };
/** Coût calculé depuis la consommation fictive du fournisseur simulé (USAGE_SIMULE). */
const COUT_SIMULE = 0.1187;

async function creerProjet(page: Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-rendu-" + Date.now());
  await page.locator('input[placeholder*="rue"]').fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  // Géocodage data.geopf.fr : réponse parfois en 7 s ou plus
  const sug = page.locator("li").first();
  if (!(await sug.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 60_000 });
  await page.waitForTimeout(5000);
  return page.url().match(/\/conception\/([a-f0-9-]+)/)?.[1] ?? null;
}

async function importerPhotoSynthetique(page: Page): Promise<void> {
  await page.evaluate(([l, h]) => {
    const canvas = document.createElement("canvas");
    canvas.width = l; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, l, h);
    ctx.fillStyle = "#228B22"; ctx.fillRect(0, h * 2 / 3, l, h / 3);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "test.jpg", { type: "image/jpeg" }));
      const input = document.querySelector("[data-testid='input-photo']") as HTMLInputElement;
      if (input) { Object.defineProperty(input, "files", { value: dt.files }); input.dispatchEvent(new Event("change", { bubbles: true })); }
    }, "image/jpeg", 0.95);
  }, [PHOTO.l, PHOTO.h] as const);
}

async function calerPhoto(page: Page) {
  await page.locator("[data-testid^='pdv-']").first().click();
  await page.waitForTimeout(2000);
  const box = await page.locator("[data-testid='plan-placement']").boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
  }
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  await page.locator("[data-testid='btn-objectif-26']").click();
  await page.waitForTimeout(300);
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  // Attendre l'enregistrement effectif du statut « calée »
  const enregistrement = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/points-de-vue\/[^/]+$/.test(new URL(r.url()).pathname)
      && (r.request().postData() ?? "").includes('"statut":"cale"'),
    { timeout: 60_000 },
  );
  await page.locator("[data-testid='btn-valider-calage']").click();
  expect((await enregistrement).ok()).toBeTruthy();
  await page.waitForTimeout(1000);
  await page.locator("[data-testid='btn-retour-visuel']").click();
  await page.waitForTimeout(500);
}

async function ouvrirVisuel(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/conception/${projetId}`);
  await page.waitForTimeout(4000);
  await page.locator("[data-testid='etape-5']").click();
  const vue = page.locator("[data-testid^='pdv-']").first();
  await vue.waitFor({ state: "visible", timeout: 15000 });
  await vue.click();
  const visuel = page.locator("[data-testid='vue-visuel']");
  const calage = page.locator("[data-testid='vue-calage']");
  await expect(visuel.or(calage)).toBeVisible({ timeout: 15000 });
  expect(await calage.isVisible(), "La vue s'est ouverte en calage : elle n'est pas enregistrée comme calée").toBe(false);
  // Végétaux affichés (textures chargées)
  await page.waitForFunction(() => {
    const t = (window as unknown as Record<string, unknown>).__visuelTest as
      { vegetaux: unknown[]; vegetauxAffiches: () => number } | undefined;
    return !!t && t.vegetauxAffiches() >= t.vegetaux.length;
  }, null, { timeout: 30000 }); // textures via URL signées Supabase, parfois lentes
  await page.waitForTimeout(1000);
}

async function ouvrirPanneau(page: Page) {
  await page.locator("[data-testid='btn-rendu-ia']").click();
  await expect(page.locator("[data-testid='panneau-rendu-ia']")).toBeVisible();
}

/** Lance une génération et attend qu'un nouveau rendu apparaisse dans la liste. */
async function generer(page: Page, bouton: string) {
  const avant = await page.locator("[data-testid^='rendu-']").count();
  await page.locator(`[data-testid='${bouton}']`).click();
  await expect(page.locator("[data-testid='progression-rendu']")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[data-testid^='rendu-']")).toHaveCount(avant + 1, { timeout: 120_000 });
  // Génération entièrement terminée (boutons réactivés) avant de rendre la main
  await expect(page.locator("[data-testid='progression-rendu']")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("[data-testid='erreur-rendu']")).toHaveCount(0);
}

async function listeRendus(page: Page) {
  const r = await page.request.get(`/api/conception/projets/${projetId}/points-de-vue/${pdvId}/rendus`);
  return (await r.json()).rendus as { id: string; style: string; cout: number; masque_path: string | null }[];
}

test.describe.serial("Rendu IA des vues (fournisseur simulé)", () => {
  test.setTimeout(240_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");
  test.skip(() => process.env.FOURNISSEUR_IMAGE !== "simule", "Lancer avec FOURNISSEUR_IMAGE=simule (aucun appel réel)");

  test("setup : projet, photo calée, massif et une plante posée dedans", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await importerPhotoSynthetique(page);
    await page.waitForTimeout(5000);
    await expect(page.locator("[data-testid^='pdv-']").first()).toBeVisible({ timeout: 10000 });
    await calerPhoto(page);

    const pdvData = await (await page.request.get(`/api/conception/projets/${projetId}/points-de-vue`)).json();
    const vue = (pdvData.points_de_vue as { id: string; camera: { x: number; y: number; cap: number } }[])[0];
    pdvId = vue.id;
    const cap = (vue.camera.cap * Math.PI) / 180;
    massif = { cx: vue.camera.x + 7 * Math.sin(cap), cy: vue.camera.y + 7 * Math.cos(cap), demi: 1.5 };
    const { cx, cy, demi } = massif;
    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [{
          id: MASSIF_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 1,
          geometrie: { type: "polygone", points: [[cx - demi, cy - demi], [cx + demi, cy - demi], [cx + demi, cy + demi], [cx - demi, cy + demi]] },
        }],
        suppressions: [], updated_at: null,
      },
    });
    expect(res.ok()).toBeTruthy();

    // Poser une plante au centre du massif, par vrai clic
    await ouvrirVisuel(page);
    const panneau = page.locator("[data-testid='panneau-vegetaux-3d']");
    if (!(await panneau.isVisible().catch(() => false))) await page.locator("[data-testid='btn-vegetaux-3d']").click();
    const plante = page.locator("[data-testid^='plante-3d-']").first();
    await expect(plante).toBeVisible({ timeout: 15000 });
    await plante.click();
    const ecran = await page.evaluate(([x, y]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        altitudeEn: (x: number, y: number) => number;
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      return t.versEcran(x, y, t.altitudeEn(x, y));
    }, [cx, cy] as const);
    expect(ecran).toBeTruthy();
    await page.mouse.click(ecran![0], ecran![1]);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[] } | undefined;
      return !!t && t.vegetaux.length === 1;
    }, null, { timeout: 5000 });
    // Laisser la sauvegarde différentielle enregistrer la plante
    await page.waitForTimeout(3000);
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(2000);
  });

  test("panneau : choix du style, coût estimé, dessin A et B côte à côte", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    await expect(page.locator("[data-testid='cout-estime-realiste']")).toContainText("€");
    await page.screenshot({ path: "e2e/screenshots/rendu-panneau-realiste.png" });

    await page.locator("[data-testid='onglet-dessin']").click();
    await expect(page.locator("[data-testid='choix-dessin']")).toBeVisible();
    await expect(page.locator("[data-testid='cout-estime-dessin-filtre']")).toHaveText("Gratuit");
    await expect(page.locator("[data-testid='cout-estime-dessin-ia']")).toContainText("€");
    await expect(page.locator("[data-testid='mention-dessin-ia']")).toHaveText("L'IA peut modifier certains détails");
    await page.screenshot({ path: "e2e/screenshots/rendu-panneau-dessin.png" });
  });

  test("réaliste : seul le massif change, le reste est la photo d'origine", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    const avant = await page.locator("[data-testid^='rendu-']").count();
    await page.locator("[data-testid='btn-generer-realiste']").click();
    await expect(page.locator("[data-testid='progression-rendu']")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/rendu-progression.png" });
    await expect(page.locator("[data-testid^='rendu-']")).toHaveCount(avant + 1, { timeout: 120_000 });
    await expect(page.locator("[data-testid='erreur-rendu']")).toHaveCount(0);

    const rendu = (await listeRendus(page)).find((r) => r.style === "realiste")!;
    expect(rendu.masque_path).toBeTruthy();
    // Coût de la consommation simulée : preuve qu'aucun appel réel n'a eu lieu
    expect(Number(rendu.cout)).toBeCloseTo(COUT_SIMULE, 4);

    // Pied de la plante, en pixels de la photo
    const pied = await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        vegetaux: { position: [number, number]; altitudeRelative: number }[];
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      const v = t.vegetaux[0];
      return t.versEcran(v.position[0], v.position[1], v.altitudeRelative);
    });
    const box = (await page.locator("[data-testid='canvas-visuel']").boundingBox())!;
    const px = Math.round(((pied![0] - box.x) * PHOTO.l) / box.width);
    const py = Math.round(((pied![1] - box.y) * PHOTO.h) / box.height) - 3;

    // Comparaison dans Node avec sharp, le décodeur du serveur : stricte, sans tolérance
    // (les navigateurs décodent le JPEG de la photo chacun à leur manière).
    const base = `/api/conception/projets/${projetId}/points-de-vue/${pdvId}`;
    const brut = async (url: string, canaux: 1 | 4) => {
      const buf = Buffer.from(await (await page.request.get(url)).body());
      const img = canaux === 4 ? sharp(buf).rotate().ensureAlpha() : sharp(buf).extractChannel(0);
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return { data, largeur: info.width, hauteur: info.height };
    };
    const [photo, image, masque] = await Promise.all([
      brut(`${base}/image`, 4), brut(`${base}/rendus/${rendu.id}/image`, 4), brut(`${base}/rendus/${rendu.id}/image?type=masque`, 1),
    ]);
    let hors = 0, horsIdentiques = 0, dedans = 0, dedansModifies = 0;
    for (let i = 0; i < masque.data.length; i++) {
      const j = i * 4;
      const ecart = Math.abs(photo.data[j] - image.data[j]) + Math.abs(photo.data[j + 1] - image.data[j + 1]) + Math.abs(photo.data[j + 2] - image.data[j + 2]);
      if (masque.data[i] === 0) { hors++; if (ecart === 0) horsIdentiques++; }
      else if (masque.data[i] === 255) { dedans++; if (ecart > 60) dedansModifies++; }
    }
    const analyse = {
      tailles: [photo.largeur, photo.hauteur, image.largeur, image.hauteur, masque.largeur, masque.hauteur],
      hors, horsIdentiques, dedans, dedansModifies,
      masquePied: masque.data[py * masque.largeur + px],
      masqueCiel: masque.data[5 * masque.largeur + Math.round(masque.largeur / 2)],
    };

    expect(analyse.tailles).toEqual([PHOTO.l, PHOTO.h, PHOTO.l, PHOTO.h, PHOTO.l, PHOTO.h]);
    expect(analyse.masquePied).toBe(255); // la plante est dans le masque
    expect(analyse.masqueCiel).toBe(0); // le ciel n'y est pas
    expect(analyse.hors).toBeGreaterThan(PHOTO.l * PHOTO.h / 3);
    // Hors masque : la photo d'origine, pixel pour pixel
    expect(analyse.horsIdentiques).toBe(analyse.hors);
    // Dans le masque : le résultat du fournisseur simulé (couleurs inversées)
    expect(analyse.dedansModifies / analyse.dedans).toBeGreaterThan(0.9);
  });

  test("dessin A (sans IA) et B (IA) : générés, listés, mention IA visible", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    await page.locator("[data-testid='onglet-dessin']").click();
    await generer(page, "btn-generer-dessin-filtre");
    await generer(page, "btn-generer-dessin-ia");

    const rendus = await listeRendus(page);
    const styles = JSON.stringify(rendus.map((r) => r.style));
    const filtre = rendus.find((r) => r.style === "dessin_filtre")!;
    const ia = rendus.find((r) => r.style === "dessin_ia")!;
    expect(filtre, `Rendus : ${styles}`).toBeTruthy();
    expect(ia, `Rendus : ${styles}`).toBeTruthy();
    expect(Number(filtre.cout)).toBe(0);
    expect(filtre.masque_path).toBeNull();
    expect(Number(ia.cout)).toBeCloseTo(COUT_SIMULE, 4);
    await expect(page.locator(`[data-testid='rendu-${ia.id}']`)).toContainText("L'IA peut modifier certains détails");

    const tailles = await page.evaluate(async (url) => {
      const bm = await createImageBitmap(await (await fetch(url)).blob());
      return [bm.width, bm.height];
    }, `/api/conception/projets/${projetId}/points-de-vue/${pdvId}/rendus/${filtre.id}/image`);
    expect(tailles).toEqual([PHOTO.l, PHOTO.h]);

    await page.waitForTimeout(1500); // chargement des vignettes
    await page.screenshot({ path: "e2e/screenshots/rendu-liste.png" });
  });

  test("téléchargement en PNG pleine résolution, puis suppression", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    const cartes = page.locator("[data-testid^='rendu-']");
    await expect(cartes).toHaveCount(3, { timeout: 10000 });

    const [telechargement] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      cartes.first().locator("[data-testid='btn-telecharger-rendu']").click(),
    ]);
    expect(telechargement.suggestedFilename()).toMatch(/\.png$/);
    const flux = await telechargement.createReadStream();
    const morceaux: Buffer[] = [];
    for await (const m of flux) morceaux.push(m as Buffer);
    const png = Buffer.concat(morceaux);
    // En-tête PNG : largeur et hauteur (octets 16 à 23)
    expect(png.readUInt32BE(16)).toBe(PHOTO.l);
    expect(png.readUInt32BE(20)).toBe(PHOTO.h);

    const supprimer = cartes.first().locator("[data-testid='btn-supprimer-rendu']");
    await supprimer.click();
    await expect(supprimer).toHaveText("Confirmer la suppression");
    await supprimer.click();
    await expect(cartes).toHaveCount(2, { timeout: 10000 });
    expect((await listeRendus(page)).length).toBe(2);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) {
      const res = await page.request.delete(`/api/conception/projets/${projetId}`);
      expect(res.ok()).toBeTruthy();
    }
  });
});
