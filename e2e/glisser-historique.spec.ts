/**
 * Tests E2E — Glisser-déposer et historique par étape.
 * Vérifie le drag, la copie Alt+drag, l'historique par étape et l'isolation projet.
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/state.json" });

let projetIdA: string | null = null;
let projetIdB: string | null = null;

async function creerProjet(page: import("@playwright/test").Page, nom: string) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill(nom);
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

async function commande(page: import("@playwright/test").Page, cmd: string) {
  await page.keyboard.type(cmd);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
}

async function elementCount(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.locator("[data-testid='element-count']").textContent();
  return parseInt(text ?? "0");
}

/** Lire l'état de l'éditeur exposé en test. */
async function getEditeurTest(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const state = (window as unknown as Record<string, unknown>).__editeurTest as {
      elements: Map<string, unknown>;
      etape: number;
      selection: Set<string>;
    } | undefined;
    if (!state) return null;
    // Convertir Map en objet pour le transfert
    const elements: Record<string, unknown> = {};
    state.elements.forEach((v: unknown, k: string) => { elements[k] = v; });
    return {
      elements,
      etape: state.etape,
      selectionIds: Array.from(state.selection),
    };
  });
}

test.describe.serial("Glisser-déposer et historique par étape", () => {
  test.setTimeout(120_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : créer projet A", async ({ page }) => {
    projetIdA = await creerProjet(page, "E2E-drag-A-" + Date.now());
    expect(projetIdA).toBeTruthy();
  });

  test("historique par étape : Cmd+Z à l'étape 4 n'annule pas l'étape 3", async ({ page }) => {
    await page.goto(`/conception/${projetIdA}`);
    await page.waitForTimeout(3000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 3 : tracer un rectangle
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);
    await commande(page, "REC");
    await page.mouse.click(cx - 40, cy - 30);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 40, cy + 30);
    await page.waitForTimeout(500);

    const countAfterRect = await elementCount(page);
    expect(countAfterRect).toBe(1);

    // Étape 4 : poser une plante (si disponible)
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (await planteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planteBtn.click();
      await page.waitForTimeout(500);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(500);

      const countAfterPlant = await elementCount(page);
      expect(countAfterPlant).toBe(2);

      // Cmd+Z à l'étape 4 → annule la plante, pas le rectangle
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(500);

      const countAfterUndo4 = await elementCount(page);
      expect(countAfterUndo4).toBe(1); // Plante annulée, rectangle reste

      // Retour étape 3, Cmd+Z → annule le rectangle
      await page.locator("[data-testid='etape-3']").click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(500);

      const countAfterUndo3 = await elementCount(page);
      expect(countAfterUndo3).toBe(0); // Rectangle annulé
    }
  });

  test("glisser un rectangle", async ({ page }) => {
    await page.goto(`/conception/${projetIdA}`);
    await page.waitForTimeout(3000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 3 : tracer un rectangle
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);
    await commande(page, "REC");
    await page.mouse.click(cx - 30, cy - 20);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 30, cy + 20);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Lire les coordonnées avant
    const avant = await getEditeurTest(page);
    expect(avant).not.toBeNull();
    const elIds = Object.keys(avant!.elements);
    expect(elIds.length).toBeGreaterThanOrEqual(1);

    // Sélectionner le rectangle
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Glisser vers la droite (assez loin pour dépasser le seuil de 3px)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5, cy, { steps: 3 }); // Dépasser le seuil
    await page.mouse.move(cx + 50, cy, { steps: 5 }); // Drag
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Vérifier que le nombre d'éléments n'a pas changé (déplacement, pas copie)
    const countAfter = await elementCount(page);
    expect(countAfter).toBe(1);
  });

  test("Alt + glisser = copie", async ({ page }) => {
    await page.goto(`/conception/${projetIdA}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 3 : créer un rectangle d'abord
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);
    await commande(page, "REC");
    await page.mouse.click(cx - 30, cy - 20);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 30, cy + 20);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const countBefore = await elementCount(page);
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Sélectionner l'élément
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Alt + glisser
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5, cy, { steps: 3 });
    await page.keyboard.down("Alt");
    await page.mouse.move(cx + 80, cy + 20, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.waitForTimeout(500);

    // La copie doit avoir créé un nouvel élément
    const countAfter = await elementCount(page);
    expect(countAfter).toBe(countBefore + 1);
  });

  test("glisser dans le vide = rectangle de sélection", async ({ page }) => {
    await page.goto(`/conception/${projetIdA}`);
    await page.waitForTimeout(3000);

    // Étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    const { cx, cy } = await canvasCentre(page);

    // Cliquer-glisser dans une zone vide (loin des éléments)
    await page.mouse.move(cx - 200, cy - 200);
    await page.mouse.down();
    await page.mouse.move(cx - 195, cy - 195, { steps: 3 }); // Seuil
    await page.mouse.move(cx + 200, cy + 200, { steps: 5 }); // Rectangle
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Le canvas doit toujours être visible (pas de crash)
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("isolation projet : Cmd+Z dans un autre projet ne fait rien", async ({ page }) => {
    // Créer un projet B
    projetIdB = await creerProjet(page, "E2E-drag-B-" + Date.now());
    expect(projetIdB).toBeTruthy();

    // Étape 3 : vérifier qu'il n'y a aucun élément
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    const countB = await elementCount(page);
    expect(countB).toBe(0);

    // Cmd+Z ne doit rien changer (pas d'historique du projet A)
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(500);

    const countBAfterUndo = await elementCount(page);
    expect(countBAfterUndo).toBe(0);
  });

  test("cleanup", async ({ page }) => {
    // Supprimer les deux projets
    if (projetIdB) await supprimerProjet(page);
    if (projetIdA) await supprimerProjet(page);
  });
});
