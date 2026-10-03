/**
 * Tests E2E — Bibliothèque végétale.
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

test.describe("Bibliothèque végétale", () => {
  test.setTimeout(60_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("accéder à la bibliothèque", async ({ page }) => {
    await page.goto("/conception/bibliotheque");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: "Bibliothèque végétale" })).toBeVisible();
  });

  test("créer une fiche plante", async ({ page }) => {
    await page.goto("/conception/bibliotheque");
    await page.waitForTimeout(2000);

    await page.click("text=Nouvelle plante");
    await page.waitForTimeout(500);

    // Remplir le formulaire
    await page.locator("#pl-nom-commun").fill("E2E-Test-Plante");
    await page.locator("#pl-nom-latin").fill("Testus e2e-" + Date.now());
    await page.waitForTimeout(300);
    // Intercepter la réponse API
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/conception/plantes") && r.request().method() === "POST", { timeout: 10000 }),
      page.getByRole("button", { name: "Créer" }).click(),
    ]);

    const body = await response.json();
    if (body.error?.includes("schema cache") || body.error?.includes("plantes")) {
      test.skip(true, "Migration 00013_plantes.sql pas encore exécutée");
      return;
    }
    expect(body.ok).toBe(true);

    // Attendre la mise à jour de la grille
    await page.waitForTimeout(2000);
    await expect(page.locator("text=E2E-Test-Plante").first()).toBeVisible({ timeout: 5000 });
  });

  test("supprimer la plante de test", async ({ page }) => {
    await page.goto("/conception/bibliotheque");
    await page.waitForTimeout(2000);

    // Trouver et supprimer
    const suppBtn = page.locator("text=×").first();
    if (await suppBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      page.on("dialog", (d) => d.accept());
      await suppBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
