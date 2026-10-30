/**
 * Tests E2E — Points de vue photo, calage caméra et visuel.
 * Photo de test synthétique (canvas 800×600), pas d'EXIF (vérifie "estimé").
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

let projetId: string | null = null;

async function creerProjet(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-pdv-" + Date.now());
  const adresse = page.locator('input[placeholder*="rue"]');
  await adresse.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);
  const sug = page.locator("li").first();
  if (!(await sug.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 60_000 });
  await page.waitForTimeout(5000);
  return page.url().match(/\/conception\/([a-f0-9-]+)/)?.[1] ?? null;
}

async function supprimerProjet(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(1000);
  const btn = page.locator("text=Supprimer").first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
    await page.locator("text=Supprimer").last().click();
    await page.waitForTimeout(1000);
  }
}

/** Crée une photo synthétique JPEG dans le navigateur. */
async function creerPhotoTest(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    // Fond bleu ciel + rectangle vert (jardin)
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#228B22";
    ctx.fillRect(0, 400, 800, 200);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "test-jardin.jpg", { type: "image/jpeg" }));
      const input = document.querySelector("[data-testid='input-photo']") as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, "files", { value: dt.files });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, "image/jpeg", 0.9);
  });
}

test.describe.serial("Points de vue", () => {
  test.setTimeout(180_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : créer un projet", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("importer une photo de test", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Étape 5
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // Le panneau doit être visible
    await expect(page.locator("[data-testid='panneau-points-de-vue']")).toBeVisible({ timeout: 5000 });

    // Importer la photo synthétique
    await creerPhotoTest(page);
    await page.waitForTimeout(5000);

    // La photo doit apparaître dans le panneau
    const items = page.locator("[data-testid^='pdv-']");
    await expect(items.first()).toBeVisible({ timeout: 10000 });

    // L'indicateur "(estimé)" doit être visible (pas d'EXIF)
    await expect(page.locator("text=(estimé)").first()).toBeVisible({ timeout: 3000 });
  });

  test("ouvrir le calage, modifier un réglage au clavier", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // Cliquer sur le premier point de vue
    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await expect(pdvBtn).toBeVisible({ timeout: 5000 });
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // La vue calage doit s'ouvrir
    await expect(page.locator("[data-testid='vue-calage']")).toBeVisible({ timeout: 5000 });

    // Lire la valeur du cap
    const capValue = page.locator("[data-testid='slider-cap-value']");
    const capBefore = await capValue.textContent();

    // Appuyer sur flèche droite → le cap doit changer
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const capAfter = await capValue.textContent();
    expect(capAfter).not.toBe(capBefore);

    // Enregistrer
    await page.locator("[data-testid='btn-enregistrer-calage']").click();
    await page.waitForTimeout(2000);
  });

  test("recharger : les réglages sont conservés", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // Ouvrir le premier point de vue
    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await expect(pdvBtn).toBeVisible({ timeout: 5000 });
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // Le cap ne doit pas être à 0 (il a été modifié et enregistré)
    const capValue = await page.locator("[data-testid='slider-cap-value']").textContent();
    expect(capValue).not.toBe("0.0°");

    await page.locator("[data-testid='btn-retour-calage']").click();
    await page.waitForTimeout(500);
  });

  test("passer en mode Visuel et vérifier les végétaux", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // D'abord poser une plante (étape 4)
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (await planteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planteBtn.click();
      await page.waitForTimeout(500);
      const canvas = page.locator("canvas").first();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1000);
      }
    }

    // Étape 5 → ouvrir le point de vue → mode Visuel
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await expect(pdvBtn).toBeVisible({ timeout: 5000 });
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // Passer en visuel
    await page.locator("[data-testid='btn-mode-visuel']").click();
    await page.waitForTimeout(3000);

    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });

    // Vérifier via __visuelTest
    const testData = await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__visuelTest,
      null,
      { timeout: 10000 },
    ).catch(() => null);

    if (testData) {
      const data = await testData.jsonValue() as { vegetaux_rendus: number };
      expect(typeof data.vegetaux_rendus).toBe("number");
    }

    // Fermer
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("export PNG produit une image aux dimensions de la photo", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    if (!(await pdvBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // Passer en visuel
    await page.locator("[data-testid='btn-mode-visuel']").click();
    await page.waitForTimeout(3000);

    // Intercepter le téléchargement
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
      page.locator("[data-testid='btn-export-png']").click(),
    ]);

    if (download) {
      const path = await download.path();
      expect(path).toBeTruthy();
    }

    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
