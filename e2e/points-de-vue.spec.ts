/**
 * Tests E2E — Points de vue photo, calage caméra en 4 étapes et visuel.
 * Photo de test synthétique (canvas 800×600), pas d'EXIF.
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

test.describe.serial("Points de vue — assistant calage", () => {
  test.setTimeout(180_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : créer un projet et importer une photo", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();

    // Aller à l'étape 5 et importer
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-testid='panneau-points-de-vue']")).toBeVisible({ timeout: 5000 });
    await creerPhotoTest(page);
    await page.waitForTimeout(5000);
    const items = page.locator("[data-testid^='pdv-']");
    await expect(items.first()).toBeVisible({ timeout: 10000 });
  });

  test("parcours complet : 4 étapes du calage avec captures", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // Ouvrir le PDV
    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await expect(pdvBtn).toBeVisible({ timeout: 5000 });
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // --- ÉTAPE 1 : Où étiez-vous ? ---
    await expect(page.locator("[data-testid='vue-calage']")).toBeVisible({ timeout: 5000 });
    const etapeText = page.locator("[data-testid='calage-etape']");
    await expect(etapeText).toContainText("Étape 1 sur 4");

    // Calage couvre tout le viewport
    const calageBox = await page.locator("[data-testid='vue-calage']").boundingBox();
    expect(calageBox).toBeTruthy();
    if (calageBox) {
      expect(calageBox.width).toBeGreaterThan(1400);
      expect(calageBox.height).toBeGreaterThan(850);
    }

    // Suivant désactivé sans placement
    const btnSuivant = page.locator("[data-testid='btn-suivant']");
    await expect(btnSuivant).toBeDisabled();

    // Deux clics sur le plan
    const planCanvas = page.locator("[data-testid='plan-placement']");
    await expect(planCanvas).toBeVisible({ timeout: 5000 });
    const box = await planCanvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      await expect(btnSuivant).toBeDisabled(); // pas de direction encore
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      await expect(btnSuivant).toBeEnabled();
    }

    await page.screenshot({ path: "e2e/screenshots/calage-etape-1.png" });
    await btnSuivant.click();
    await page.waitForTimeout(1000);

    // --- ÉTAPE 2 : Quel objectif ? ---
    await expect(etapeText).toContainText("Étape 2 sur 4", { timeout: 3000 });
    await expect(page.locator("[data-testid='calage-etape-2']")).toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: "e2e/screenshots/calage-etape-2.png" });

    // Choisir Principal (26 mm)
    await page.locator("[data-testid='btn-objectif-26']").click();
    await page.waitForTimeout(1000);

    // --- ÉTAPE 3 : Alignez la maison ---
    await expect(etapeText).toContainText("Étape 3 sur 4", { timeout: 3000 });
    await expect(page.locator("[data-testid='calage-etape-3']")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[data-testid='photo-calage']")).toBeVisible({ timeout: 5000 });

    // Grille masquée par défaut
    const btnRelief = page.locator("[data-testid='btn-afficher-relief']");
    await expect(btnRelief).toContainText("Afficher le relief");

    // Réglages fermés par défaut
    await expect(page.locator("text=Réglages précis")).not.toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/calage-etape-3.png" });

    // Suivant → étape 4
    await page.locator("[data-testid='btn-suivant']").click();
    await page.waitForTimeout(1000);

    // --- ÉTAPE 4 : C'est calé ---
    await expect(etapeText).toContainText("Étape 4 sur 4", { timeout: 3000 });
    await expect(page.locator("[data-testid='calage-etape-4']")).toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: "e2e/screenshots/calage-etape-4.png" });

    // Valider → passage au visuel
    await page.locator("[data-testid='btn-valider-calage']").click();
    await page.waitForTimeout(3000);
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });

    // Fermer le visuel
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("cap ≠ 0 après le calage", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await expect(pdvBtn).toBeVisible({ timeout: 5000 });
    await pdvBtn.click();
    await page.waitForTimeout(2000);

    // Le PDV a été calé, donc on doit être à l'étape 3 (pas 1)
    await expect(page.locator("[data-testid='calage-etape']")).toContainText("Étape 3 sur 4", { timeout: 5000 });

    // Ouvrir les réglages pour vérifier le cap
    await page.locator("[data-testid='panneau-reglages']").click();
    await page.waitForTimeout(300);

    const capValue = await page.locator("[data-testid='slider-cap-value']").textContent();
    expect(capValue).not.toBe("0.0°");

    await page.locator("[data-testid='btn-retour-calage']").click();
    await page.waitForTimeout(500);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
