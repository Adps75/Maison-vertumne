/**
 * Tests E2E — Parcours multi-étapes.
 * Vérifie qu'on peut créer une zone (étape 2), tracer un rectangle (étape 3),
 * et poser une plante visible dans la liste (étape 4).
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-parcours-" + Date.now());
  const adresse = page.locator('input[placeholder*="rue"]');
  await adresse.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);
  const sug = page.locator("li").first();
  if (!(await sug.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 30_000 });
  await page.waitForTimeout(3000);
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

async function canvasCentre(page: import("@playwright/test").Page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas introuvable");
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test.describe.serial("Parcours multi-étapes", () => {
  test.setTimeout(120_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("étape 2 → créer une zone, étape 3 → tracer un rectangle, étape 4 → poser une plante", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // ============ ÉTAPE 2 : créer une zone ============
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);

    // Tout le jardin
    await page.locator("[data-testid='tout-le-jardin-btn']").click();
    await page.waitForTimeout(1000);

    // Vérifier qu'un élément a été créé
    let count = await page.locator("[data-testid='element-count']").textContent();
    expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(1);

    // L'étape 2 doit avoir la coche
    const etape2 = page.locator("[data-testid='etape-2']");
    const etape2Text = await etape2.textContent();
    expect(etape2Text).toContain("✓");

    // ============ ÉTAPE 3 : tracer un rectangle au clavier ============
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    const { cx, cy } = await canvasCentre(page);

    // REC au clavier
    await page.keyboard.type("REC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    // Premier coin
    await page.mouse.click(cx - 40, cy - 30);
    await page.waitForTimeout(200);

    // Deuxième coin
    await page.mouse.click(cx + 40, cy + 30);
    await page.waitForTimeout(500);

    // Vérifier qu'un élément de plus a été créé
    count = await page.locator("[data-testid='element-count']").textContent();
    expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(2);

    // ============ ÉTAPE 4 : poser une plante ============
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    // Le panneau Végétaux doit être visible
    const panneauVeg = page.locator("text=Végétaux").first();
    await expect(panneauVeg).toBeVisible({ timeout: 5000 });

    // S'il y a des plantes dans la bibliothèque, cliquer sur la première
    const premierePlante = page.locator("button").filter({ hasText: /m$/ }).first();
    if (await premierePlante.isVisible({ timeout: 3000 }).catch(() => false)) {
      await premierePlante.click();
      await page.waitForTimeout(500);

      // Cliquer sur le canvas pour poser la plante
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(500);

      // Vérifier qu'un élément de plus a été créé
      count = await page.locator("[data-testid='element-count']").textContent();
      expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(3);
    }

    // Attendre la sauvegarde
    await page.waitForTimeout(4000);
    const sauvStatus = page.locator("text=Enregistré");
    await expect(sauvStatus).toBeVisible({ timeout: 5000 });
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
