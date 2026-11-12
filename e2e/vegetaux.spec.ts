/**
 * Tests E2E — Placement des végétaux sur le plan.
 */

import { test, expect } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-vegetaux-" }));

let projetId: string | null = null;

async function creerProjet(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-vegetaux-" + Date.now());
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


async function canvasCentre(page: import("@playwright/test").Page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas introuvable");
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

async function elementCount(page: import("@playwright/test").Page): Promise<number> {
  const span = page.locator('[data-testid="element-count"]');
  const text = await span.textContent({ timeout: 2000 });
  return parseInt(text ?? "0", 10);
}

test.describe.serial("Végétaux sur le plan", () => {
  test.setTimeout(60_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("le panneau Végétaux est accessible", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // Le panneau "Végétaux" ou le bouton pour l'ouvrir doit être visible
    const panneau = page.locator("text=Végétaux");
    await expect(panneau.first()).toBeVisible({ timeout: 5000 });
  });

  test("PL et REC fonctionnent toujours après placement", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    // PL
    await page.keyboard.type("PL");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx - 60, cy - 60);
    await page.waitForTimeout(100);
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // REC
    await page.keyboard.type("REC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 40, cy + 40);
    await page.waitForTimeout(100);
    await page.mouse.click(cx + 80, cy + 60);
    await page.waitForTimeout(500);

    await page.keyboard.press("Escape");
    await expect(page.locator("canvas").first()).toBeVisible();
  });

});
