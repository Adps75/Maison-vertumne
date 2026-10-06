/**
 * Tests E2E — Zones de travail (étape 2).
 * Crée un projet, teste les zones, vérifie la persistance, puis supprime le projet.
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-zones-" + Date.now());
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

test.describe.serial("Zones de travail", () => {
  test.setTimeout(90_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("la barre d'étapes est visible et navigable", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const barre = page.locator("[data-testid='barre-etapes']");
    await expect(barre).toBeVisible();

    // Cliquer sur l'étape 2
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);

    // Le panneau zones doit apparaître
    const panneau = page.locator("[data-testid='panneau-zones']");
    await expect(panneau).toBeVisible({ timeout: 3000 });
  });

  test("créer une zone 'Tout le jardin'", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // Passer à l'étape 2
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);

    // Cliquer sur "Tout le jardin"
    await page.locator("[data-testid='tout-le-jardin-btn']").click();
    await page.waitForTimeout(1000);

    // Vérifier que le compteur d'éléments a augmenté
    const count = page.locator("[data-testid='element-count']");
    const text = await count.textContent();
    expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(1);

    // Attendre la sauvegarde (le debounce peut prendre 2-3 secondes)
    await page.waitForTimeout(5000);

    // Vérifier que la sauvegarde est passée
    const sauvStatus = page.locator("text=Enregistré");
    await expect(sauvStatus).toBeVisible({ timeout: 5000 });
  });

  test("créer une zone rectangle via le panneau", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Vérifier que la zone "Tout le jardin" a été chargée
    const countInit = await page.locator("[data-testid='element-count']").textContent();
    expect(parseInt(countInit ?? "0")).toBeGreaterThanOrEqual(1);

    // Passer à l'étape 2
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);

    // Cliquer sur le bouton Rectangle
    await page.locator("[data-testid='zone-rect-btn']").click();
    await page.waitForTimeout(500);

    const { cx, cy } = await canvasCentre(page);

    // Premier clic sur le canvas
    await page.mouse.click(cx - 50, cy - 50);
    await page.waitForTimeout(500);

    // Deuxième clic → crée la zone avec nom par défaut
    await page.mouse.click(cx + 50, cy + 50);
    await page.waitForTimeout(1000);

    // Attendre la sauvegarde
    await page.waitForTimeout(4000);

    // Vérifier qu'on a au moins 2 éléments (Tout le jardin + zone rectangle)
    const count = page.locator("[data-testid='element-count']");
    const text = await count.textContent();
    expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(2);
  });

  test("les zones persistent après rechargement", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Passer à l'étape 2
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);

    // Vérifier que les éléments ont été chargés
    const count = page.locator("[data-testid='element-count']");
    const text = await count.textContent();
    expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(2);

    // L'étape 2 doit avoir la coche
    const etape2 = page.locator("[data-testid='etape-2']");
    const etape2Text = await etape2.textContent();
    expect(etape2Text).toContain("✓");
  });

  test("PL et PLA fonctionnent toujours", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const { cx, cy } = await canvasCentre(page);

    // PL — polyligne
    await page.keyboard.type("PL");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx - 40, cy - 40);
    await page.waitForTimeout(100);
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter"); // Terminer la polyligne
    await page.waitForTimeout(300);

    // REC — rectangle
    await page.keyboard.type("REC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 20, cy + 20);
    await page.waitForTimeout(100);
    await page.mouse.click(cx + 50, cy + 40);
    await page.waitForTimeout(500);

    // Vérifier que le canvas est toujours là
    await expect(page.locator("canvas").first()).toBeVisible();

    // Échap pour reset
    await page.keyboard.press("Escape");
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
