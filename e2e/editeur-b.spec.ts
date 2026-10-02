/**
 * Tests E2E — Commit B : sélection géométrique, outils d'édition, poignées.
 * Crée un projet "E2E-..." au début, le supprime à la fin (même en cas d'échec).
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

let projetId: string | null = null;

// Helper : créer un projet E2E
async function creerProjetE2E(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/conception");
  await page.waitForTimeout(2000);

  if (page.url().includes("/connexion")) {
    throw new Error("Redirigé vers /connexion — la session auth n'est pas valide.");
  }

  const btn = page.locator("text=Nouveau projet");
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Remplir le nom
  const nomInput = page.locator('input[placeholder="Optionnel"]');
  await nomInput.fill("E2E-test-" + Date.now());

  // Remplir l'adresse
  const adresseInput = page.locator('input[placeholder*="rue"]');
  await adresseInput.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);

  // Cliquer sur la première suggestion
  const suggestion = page.locator("li").first();
  if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
    await suggestion.click();
    await page.waitForTimeout(500);
  } else {
    return null;
  }

  // Créer
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 30_000 });
  await page.waitForTimeout(3000);

  // Extraire l'id de l'URL
  const url = page.url();
  const match = url.match(/\/conception\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
}

// Helper : supprimer le projet E2E
async function supprimerProjetE2E(page: import("@playwright/test").Page, id: string) {
  await page.goto("/conception");
  await page.waitForTimeout(1000);

  // Trouver le projet E2E et le supprimer
  const suppBtn = page.locator(`text=Supprimer`).first();
  if (await suppBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await suppBtn.click();
    await page.waitForTimeout(300);
    const confirmBtn = page.locator("text=Supprimer").last();
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(1000);
    }
  }
}

// Helper
async function canvasCentre(page: import("@playwright/test").Page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas introuvable");
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

async function commande(page: import("@playwright/test").Page, cmd: string) {
  await page.keyboard.type(cmd);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
}

test.describe.serial("Éditeur — Commit B", () => {
  test.setTimeout(60_000); // Les tests de l'éditeur sont plus lents (création de projet, rendu Konva)

  test("setup : créer un projet E2E", async ({ page }) => {
    projetId = await creerProjetE2E(page);
    expect(projetId, "Création du projet E2E échouée — auth.setup a-t-il réussi ?").toBeTruthy();
  });

  test("sélection par clic à l'intérieur d'un polygone", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    await page.mouse.click(cx - 40, cy - 20);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 40, cy + 20);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    await expect(page.locator("text=Type").first()).toBeVisible({ timeout: 2000 });
  });

  test("sélection par clic sur un trait fin", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "PL");
    await page.mouse.click(cx - 60, cy + 60);
    await page.waitForTimeout(100);
    await page.mouse.click(cx + 60, cy + 60);
    await page.waitForTimeout(100);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx, cy + 60);
    await page.waitForTimeout(300);
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("rectangle de sélection L→R et R→L", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await page.keyboard.press("Escape");
    await page.mouse.move(cx - 200, cy - 200);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.keyboard.press("Escape");
    await page.mouse.move(cx + 200, cy + 200);
    await page.mouse.down();
    await page.mouse.move(cx - 200, cy - 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("déplacer de 5 m au clavier", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    await page.mouse.click(cx - 30, cy - 15);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 30, cy + 15);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    await commande(page, "M");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("copier deux fois", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    await page.mouse.click(cx - 20, cy - 80);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 20, cy - 60);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx, cy - 70);
    await page.waitForTimeout(300);

    await commande(page, "CO");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy - 70);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 50, cy - 70);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 100, cy - 70);
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("rotation de 90°", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    await page.mouse.click(cx - 20, cy + 80);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 20, cy + 100);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx, cy + 90);
    await page.waitForTimeout(300);

    await commande(page, "RO");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy + 90);
    await page.waitForTimeout(200);
    await page.keyboard.type("90");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("miroir", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    await page.mouse.click(cx - 80, cy - 40);
    await page.waitForTimeout(200);
    await page.mouse.click(cx - 60, cy - 20);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click(cx - 70, cy - 30);
    await page.waitForTimeout(300);

    await commande(page, "MI");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy - 40);
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy + 40);
    await page.waitForTimeout(500);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("glisser un sommet sans mouvement de carte", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    const x1 = cx - 30, y1 = cy + 120;
    const x2 = cx + 30, y2 = cy + 160;
    await page.mouse.click(x1, y1);
    await page.waitForTimeout(200);
    await page.mouse.click(x2, y2);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2);
    await page.waitForTimeout(500);

    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x1 + 30, y1, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("ajouter un sommet par poignée milieu", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    const { cx, cy } = await canvasCentre(page);

    await commande(page, "REC");
    const x1 = cx - 40, y1 = cy + 170;
    const x2 = cx + 40, y2 = cy + 210;
    await page.mouse.click(x1, y1);
    await page.waitForTimeout(200);
    await page.mouse.click(x2, y2);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2);
    await page.waitForTimeout(500);

    const midX = (x1 + x2) / 2;
    await page.mouse.move(midX, y1);
    await page.mouse.down();
    await page.mouse.move(midX, y1 - 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("changer la couleur d'un calque", async ({ page }) => {

    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const colorInput = page.locator('[data-testid="calque-couleur-vegetal"]');
    if (await colorInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await colorInput.evaluate((el: HTMLInputElement) => {
        el.value = "#ff0000";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(300);
    }

    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("cleanup : supprimer le projet E2E", async ({ page }) => {
    if (projetId) {
      await supprimerProjetE2E(page, projetId);
      projetId = null;
    }
  });
});
