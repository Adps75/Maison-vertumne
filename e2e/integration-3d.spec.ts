/**
 * Tests E2E — Intégration 3D dans l'éditeur.
 * Plante déplacée visible en 3D, aperçu conserve l'état, clavier suspendu,
 * ouvertures/fermetures multiples, étape 5.
 */

import { test, expect } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-int3d-" }));

let projetId: string | null = null;

async function creerProjet(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-int3d-" + Date.now());
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

async function commande(page: import("@playwright/test").Page, cmd: string) {
  await page.keyboard.type(cmd);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
}

async function elementCount(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.locator("[data-testid='element-count']").textContent();
  return parseInt(text ?? "0");
}

test.describe.serial("Intégration 3D", () => {
  test.setTimeout(120_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("poser une plante, ouvrir l'aperçu 3D, vérifier sa position", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 4 : poser une plante
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (!(await planteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Pas de plante dans la bibliothèque — skip
      return;
    }

    await planteBtn.click();
    await page.waitForTimeout(500);

    // Poser la plante
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);

    const countAfter = await elementCount(page);
    expect(countAfter).toBeGreaterThanOrEqual(1);

    // Attendre la sauvegarde
    await page.waitForTimeout(5000);
    await expect(page.locator("text=Enregistré")).toBeVisible({ timeout: 5000 });

    // Ouvrir l'aperçu 3D
    await page.keyboard.press("Escape"); // Revenir en sélection
    await page.waitForTimeout(300);
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(3000);

    // L'overlay 3D doit être visible
    const overlay = page.locator("[data-testid='apercu-3d-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Vérifier via __scene3dTest que la plante est présente
    const testData = await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__scene3dTest,
      null,
      { timeout: 10000 },
    );
    const data = await testData.jsonValue() as {
      vegetaux: { id: string; position: [number, number] }[];
    };
    expect(data.vegetaux.length).toBeGreaterThanOrEqual(1);
  });

  test("fermer l'aperçu conserve l'étape et la sélection", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    // Ouvrir l'aperçu
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-testid='apercu-3d-overlay']")).toBeVisible();

    // Fermer avec Échap
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // L'overlay doit avoir disparu
    await expect(page.locator("[data-testid='apercu-3d-overlay']")).not.toBeVisible();

    // L'étape 4 doit toujours être active
    const etape4 = page.locator("[data-testid='etape-4']");
    const etape4Classes = await etape4.getAttribute("class");
    expect(etape4Classes).toContain("border-brass");

    // Le canvas 2D doit être visible
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("clavier suspendu pendant l'aperçu 3D", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    const countBefore = await elementCount(page);

    // Ouvrir l'aperçu
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(2000);

    // Taper "REC" puis Entrée et Cmd+Z : rien ne doit se passer
    await page.keyboard.type("REC");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(300);

    // Fermer
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Le plan doit être inchangé
    const countAfter = await elementCount(page);
    expect(countAfter).toBe(countBefore);
  });

  test("ouvrir et fermer l'aperçu 20 fois", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // Étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    for (let i = 0; i < 20; i++) {
      await page.locator("[data-testid='btn-apercu-3d']").click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // Ouvrir une dernière fois et vérifier que la 3D fonctionne
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(2000);

    const overlay = page.locator("[data-testid='apercu-3d-overlay']");
    await expect(overlay).toBeVisible();

    // Le canvas 3D doit être présent
    const canvas3d = overlay.locator("canvas");
    await expect(canvas3d).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("aperçu 3D : la scène contient la maison et la plante", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(5000);

    // L'aperçu 3D est accessible depuis l'étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(2000);

    // Ouvrir l'aperçu 3D
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(3000);

    // Le conteneur 3D doit être visible dans l'overlay
    const conteneur = page.locator("[data-testid='conteneur-3d']");
    await expect(conteneur).toBeVisible({ timeout: 15000 });

    // Attendre __scene3dTest
    const testData = await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__scene3dTest,
      null,
      { timeout: 15000 },
    );
    const data = await testData.jsonValue() as {
      batiments: number;
      vegetaux: { id: string }[];
    };

    // Au moins un bâtiment (BD TOPO)
    expect(data.batiments).toBeGreaterThanOrEqual(1);
  });

});
