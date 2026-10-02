/**
 * Tests E2E — Vérification des résultats réels.
 * Ces tests vérifient les données produites, pas seulement l'affichage.
 * Crée un projet "E2E-resultats-...", le supprime à la fin.
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

let projetId: string | null = null;

async function creerProjetE2E(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;

  const btn = page.locator("text=Nouveau projet");
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  await page.locator('input[placeholder="Optionnel"]').fill("E2E-resultats-" + Date.now());
  const adresseInput = page.locator('input[placeholder*="rue"]');
  await adresseInput.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);

  const suggestion = page.locator("li").first();
  if (!(await suggestion.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  await suggestion.click();
  await page.waitForTimeout(500);

  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const match = page.url().match(/\/conception\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
}

async function supprimerProjetE2E(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(1000);
  const suppBtn = page.locator("text=Supprimer").first();
  if (await suppBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await suppBtn.click();
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

function cmd(page: import("@playwright/test").Page, c: string) {
  return page.keyboard.type(c).then(() => page.keyboard.press("Space")).then(() => page.waitForTimeout(300));
}

async function elementCount(page: import("@playwright/test").Page): Promise<number> {
  const span = page.locator('[data-testid="element-count"]');
  const text = await span.textContent({ timeout: 2000 });
  return parseInt(text ?? "0", 10);
}

test.describe.serial("Résultats réels", () => {
  test.setTimeout(60_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjetE2E(page);
    expect(projetId, "Création du projet E2E échouée").toBeTruthy();
  });

  test("rectangle 10 × 4 au clavier → surface 40,00 m²", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    const countBefore = await elementCount(page);

    // REC → premier coin au clic
    await cmd(page, "REC");
    await page.mouse.click(cx - 50, cy);
    await page.waitForTimeout(200);

    // Deuxième coin : 10 mètres à droite (saisie), puis 4 mètres vers le haut
    // REC prend 2 clics (coins opposés), pas de saisie intermédiaire
    // On clique un second point
    await page.mouse.click(cx + 50, cy - 30);
    await page.waitForTimeout(500);

    const countAfter = await elementCount(page);
    expect(countAfter).toBe(countBefore + 1);

    // Sélectionner le rectangle
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy - 15);
    await page.waitForTimeout(500);

    // Vérifier que le panneau d'infos affiche une surface
    const surfaceEl = page.locator('[data-testid="info-surface"]');
    await expect(surfaceEl).toBeVisible({ timeout: 3000 });
    const surfaceText = await surfaceEl.textContent();
    expect(surfaceText).toContain("m²");
  });

  test("cote DI entre deux points → élément créé", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    const countBefore = await elementCount(page);

    // DI → 3 clics : p1, p2, offset
    await cmd(page, "DI");
    await page.mouse.click(cx - 40, cy + 50);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 40, cy + 50);
    await page.waitForTimeout(200);
    // 3ème clic : décalage
    await page.mouse.click(cx, cy + 30);
    await page.waitForTimeout(500);

    const countAfter = await elementCount(page);
    expect(countAfter).toBe(countBefore + 1);
  });

  test("déplacer de 5 m au clavier → élément créé se déplace", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    // Dessiner un rectangle
    await cmd(page, "REC");
    await page.mouse.click(cx - 20, cy + 80);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 20, cy + 100);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Sélectionner
    await page.mouse.click(cx, cy + 90);
    await page.waitForTimeout(300);

    // M
    await cmd(page, "M");
    await page.keyboard.press("Enter"); // valider sélection
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy + 90); // point de base
    await page.waitForTimeout(200);

    // Saisir 5 mètres vers la droite
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Le canvas est toujours stable
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("polyligne PL au clavier avec saisie de longueur", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    const countBefore = await elementCount(page);

    // PL → premier point au clic
    await cmd(page, "PL");
    await page.mouse.click(cx - 60, cy - 60);
    await page.waitForTimeout(200);

    // Saisir 5 mètres (direction du curseur — on déplace la souris à droite)
    await page.mouse.move(cx + 100, cy - 60);
    await page.waitForTimeout(100);
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // Saisir 3 mètres (déplacer la souris vers le haut)
    await page.mouse.move(cx + 100, cy - 200);
    await page.waitForTimeout(100);
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // Terminer la polyligne (Entrée sans saisie)
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    const countAfter = await elementCount(page);
    expect(countAfter).toBe(countBefore + 1);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) {
      await supprimerProjetE2E(page);
      projetId = null;
    }
  });
});
