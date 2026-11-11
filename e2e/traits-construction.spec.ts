/**
 * Tests E2E — Traits de construction dans le Visuel.
 *
 * - traits présents quand l'option est active, absents quand elle est coupée ;
 * - jamais dans l'export PNG ;
 * - pose d'une plante par vrai clic à l'intérieur d'un massif tracé (les traits
 *   ne bloquent pas les clics).
 * Captures : e2e/screenshots/visuel-avec-traits.png et visuel-sans-traits.png.
 */

import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

let projetId: string | null = null;
const MASSIF_ID = crypto.randomUUID();
/** Centre et demi-côté du massif carré, calculés devant la caméra calée. */
let massif: { cx: number; cy: number; demi: number } | null = null;

async function creerProjet(page: Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-traits-" + Date.now());
  const adresse = page.locator('input[placeholder*="rue"]');
  await adresse.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);
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
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#228B22"; ctx.fillRect(0, 400, 800, 200);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "test.jpg", { type: "image/jpeg" }));
      const input = document.querySelector("[data-testid='input-photo']") as HTMLInputElement;
      if (input) { Object.defineProperty(input, "files", { value: dt.files }); input.dispatchEvent(new Event("change", { bubbles: true })); }
    }, "image/jpeg", 0.9);
  });
}

/** Cale la photo via l'assistant (s'arrête dans le Visuel, puis revient). */
async function calerPhoto(page: Page) {
  await page.locator("[data-testid^='pdv-']").first().click();
  await page.waitForTimeout(2000);
  const plan = page.locator("[data-testid='plan-placement']");
  const box = await plan.boundingBox();
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
  // Étape 3 « Alignez la maison » : le bouton Traits de construction est présent et actif
  await expect(page.locator("[data-testid='btn-traits']")).toHaveAttribute("aria-pressed", "true");
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

/** Ouvre le Visuel de la première vue (déjà calée). */
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
  await page.waitForTimeout(2000); // chargement de la photo et des scènes
}

/** Nombre de pixels non transparents de la scène des traits (superposée). */
async function pixelsTraits(page: Page): Promise<number> {
  return page.evaluate(() => {
    const src = document.querySelector("[data-testid='traits-visuel'] canvas") as HTMLCanvasElement | null;
    if (!src) return -1;
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
}

async function attendreTraits(page: Page, present: boolean) {
  await page.waitForFunction(([id, p]) => {
    const t = (window as unknown as Record<string, unknown>).__traitsTest as { ids: string[] } | undefined;
    return !!t && t.ids.includes(id as string) === p;
  }, [MASSIF_ID, present] as const, { timeout: 10000 });
  await page.waitForTimeout(500); // laisser une image se dessiner
}

/** Exporte le PNG du visuel et renvoie son contenu en base64. */
async function exporterPng(page: Page): Promise<string> {
  const [telechargement] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("[data-testid='btn-export-png']").click(),
  ]);
  const flux = await telechargement.createReadStream();
  const morceaux: Buffer[] = [];
  for await (const m of flux) morceaux.push(m as Buffer);
  return Buffer.concat(morceaux).toString("base64");
}

/** Compare deux PNG pixel à pixel dans le navigateur. */
async function pixelsDifferents(page: Page, a: string, b: string): Promise<{ total: number; differents: number }> {
  return page.evaluate(async ([pa, pb]) => {
    const lire = async (b64: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const [ia, ib] = await Promise.all([lire(pa), lire(pb)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { total: -1, differents: -1 };
    let differents = 0;
    for (let i = 0; i < ia.data.length; i += 4) {
      if (Math.abs(ia.data[i] - ib.data[i]) + Math.abs(ia.data[i + 1] - ib.data[i + 1]) + Math.abs(ia.data[i + 2] - ib.data[i + 2]) > 24) {
        differents++;
      }
    }
    return { total: ia.width * ia.height, differents };
  }, [a, b] as const);
}

test.describe.serial("Traits de construction", () => {
  test.setTimeout(240_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : projet, photo calée, massif tracé devant la caméra", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await importerPhotoSynthetique(page);
    await page.waitForTimeout(5000);
    await expect(page.locator("[data-testid^='pdv-']").first()).toBeVisible({ timeout: 10000 });
    await calerPhoto(page);

    // Caméra calée → massif carré de 3 m, centré 7 m devant elle
    const pdvRes = await page.request.get(`/api/conception/projets/${projetId}/points-de-vue`);
    const pdvData = await pdvRes.json();
    const vues = (pdvData.points_de_vue ?? []) as { camera: { x: number; y: number; cap: number } }[];
    const cam = vues[0]?.camera;
    expect(cam, `Réponse points de vue : ${JSON.stringify(pdvData).slice(0, 200)}`).toBeTruthy();
    const cap = (cam!.cap * Math.PI) / 180;
    massif = { cx: cam!.x + 7 * Math.sin(cap), cy: cam!.y + 7 * Math.cos(cap), demi: 1.5 };
    const { cx, cy, demi } = massif;

    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [{
          id: MASSIF_ID,
          type: "sol",
          geometrie: { type: "polygone", points: [[cx - demi, cy - demi], [cx + demi, cy - demi], [cx + demi, cy + demi], [cx - demi, cy + demi]] },
          calque: "sols",
          statut: "nouveau",
          hauteur: null,
          proprietes: {},
          ordre: 1,
        }],
        suppressions: [],
        updated_at: null,
      },
    });
    expect(res.ok(), `Création du massif : ${await res.text()}`).toBeTruthy();
  });

  test("traits présents quand l'option est active, absents quand elle est coupée", async ({ page }) => {
    await ouvrirVisuel(page);

    const bouton = page.locator("[data-testid='btn-traits']");
    await expect(bouton).toHaveAttribute("aria-pressed", "true"); // activé par défaut
    await attendreTraits(page, true);
    const avecTraits = await pixelsTraits(page);
    expect(avecTraits).toBeGreaterThan(200);
    await page.screenshot({ path: "e2e/screenshots/visuel-avec-traits.png" });

    await bouton.click();
    await expect(bouton).toHaveAttribute("aria-pressed", "false");
    await attendreTraits(page, false);
    expect(await pixelsTraits(page)).toBe(0);
    await page.screenshot({ path: "e2e/screenshots/visuel-sans-traits.png" });

    // Choix des calques : décocher « Sols » masque le massif
    await bouton.click();
    await attendreTraits(page, true);
    await page.locator("[data-testid='btn-traits-calques']").click();
    await expect(page.locator("[data-testid='menu-traits-calques']")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/visuel-menu-traits.png" });
    await page.locator("[data-testid='case-trait-sols']").uncheck();
    await attendreTraits(page, false);
    await page.locator("[data-testid='case-trait-sols']").check();
    await attendreTraits(page, true);
    await page.locator("[data-testid='btn-traits-calques']").click();
  });

  test("les traits ne figurent jamais dans l'export PNG", async ({ page }) => {
    await ouvrirVisuel(page);
    await attendreTraits(page, true);
    expect(await pixelsTraits(page)).toBeGreaterThan(200);
    const exportAvec = await exporterPng(page);

    await page.locator("[data-testid='btn-traits']").click();
    await attendreTraits(page, false);
    const exportSans = await exporterPng(page);

    const { total, differents } = await pixelsDifferents(page, exportAvec, exportSans);
    expect(total).toBeGreaterThan(0);
    // Le massif tracé couvre plusieurs centaines de pixels à l'écran : s'il figurait
    // dans l'export, les deux images différeraient nettement.
    expect(differents).toBe(0);
  });

  test("pose d'une plante par vrai clic à l'intérieur du massif tracé", async ({ page }) => {
    await ouvrirVisuel(page);
    await attendreTraits(page, true); // traits affichés pendant la pose

    const avant = await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[] } | undefined;
      return t?.vegetaux.length ?? -1;
    });

    const panneau = page.locator("[data-testid='panneau-vegetaux-3d']");
    if (!(await panneau.isVisible().catch(() => false))) {
      await page.locator("[data-testid='btn-vegetaux-3d']").click();
      await page.waitForTimeout(300);
    }
    const premierePlante = page.locator("[data-testid^='plante-3d-']").first();
    // La liste dépend de l'API plantes (URL signées Supabase) : délai large
    await expect(premierePlante).toBeVisible({ timeout: 15000 });
    await premierePlante.click();
    await page.waitForTimeout(500);

    const { cx, cy, demi } = massif!;
    const ecran = await page.evaluate(([x, y]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        altitudeEn: (x: number, y: number) => number;
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      return t.versEcran(x, y, t.altitudeEn(x, y));
    }, [cx, cy] as const);
    expect(ecran, "Le centre du massif doit être visible dans le Visuel").toBeTruthy();

    await page.mouse.move(ecran![0], ecran![1]);
    await page.waitForTimeout(200);
    await page.mouse.click(ecran![0], ecran![1]);

    await page.waitForFunction((n) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[] } | undefined;
      return !!t && t.vegetaux.length > (n as number);
    }, avant, { timeout: 5000 });

    const pose = await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: { position: [number, number] }[] };
      return t.vegetaux[t.vegetaux.length - 1].position;
    });
    // Plante posée à l'intérieur du massif, sous le curseur
    expect(Math.abs(pose[0] - cx)).toBeLessThan(demi);
    expect(Math.abs(pose[1] - cy)).toBeLessThan(demi);
    expect(Math.hypot(pose[0] - cx, pose[1] - cy)).toBeLessThan(0.2);
  });

  test("calage « Alignez la maison » : traits affichés par défaut, masquables", async ({ page }) => {
    await ouvrirVisuel(page);
    await page.locator("[data-testid='btn-mode-calage-from-visuel']").click();
    await expect(page.locator("[data-testid='calage-etape-3']")).toBeVisible({ timeout: 5000 });
    const bouton = page.locator("[data-testid='btn-traits']");
    await expect(bouton).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/calage-avec-traits.png" });
    await bouton.click();
    await expect(bouton).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(800);
    await page.screenshot({ path: "e2e/screenshots/calage-sans-traits.png" });
    await page.locator("[data-testid='btn-retour-calage']").click();
  });

  test("cleanup", async ({ page }) => {
    if (projetId) {
      const res = await page.request.delete(`/api/conception/projets/${projetId}`);
      expect(res.ok()).toBeTruthy();
    }
  });
});
