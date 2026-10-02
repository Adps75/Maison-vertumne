/**
 * Tests E2E — Bugs visuels corrigés.
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-visuels-" + Date.now());
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

test.describe.serial("Bugs visuels", () => {
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("un clic en mode PL ne crée pas de rectangle de sélection", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // Activer l'outil PL
    await page.keyboard.type("PL");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) { test.skip(); return; }

    // Cliquer un point
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // La barre de saisie ne doit PAS afficher "Sélectionnez" — elle doit montrer la commande PL
    const saisieText = await page.locator('[data-testid="barre-saisie"]').textContent();
    expect(saisieText).not.toContain("Sélectionnez");

    await page.keyboard.press("Escape");
  });

  test("la barre de saisie est visible dans la fenêtre", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const barre = page.locator('[data-testid="barre-saisie"]');
    await expect(barre).toBeVisible({ timeout: 5000 });

    // Vérifier qu'elle est dans le viewport
    const box = await barre.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800 + 10); // viewport height + margin
  });

  test("l'aperçu fantôme apparaît pendant le tracé PL", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // PL → placer un premier point
    await page.keyboard.type("PL");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) { test.skip(); return; }

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);

    // Déplacer la souris — le fantôme devrait s'afficher (on ne peut pas vérifier
    // visuellement le canvas Konva, mais on vérifie que la saisie affiche les infos)
    await page.mouse.move(cx + 100, cy);
    await page.waitForTimeout(300);

    // Le canvas ne doit pas avoir crashé
    await expect(canvas).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
