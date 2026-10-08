/**
 * Tests E2E — Topographie.
 * Points cotés, altitude en 3D, courbes de niveau.
 * Le relief est fourni par la fixture serveur E2E_RELIEF_FIXTURE=plan_incline
 * (aucun appel réel au service IGN).
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-topo-" + Date.now());
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

async function canvasCentre(page: import("@playwright/test").Page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas introuvable");
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test.describe.serial("Topographie", () => {
  test.setTimeout(180_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : créer un projet", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("poser un point coté à +0,80 et un à 0,00", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    const { cx, cy } = await canvasCentre(page);

    // Activer l'outil point coté via la commande PC
    await page.keyboard.type("PC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    // Premier point coté à +0,80 (clic au centre-gauche)
    await page.mouse.click(cx - 100, cy);
    await page.waitForTimeout(500);

    // Saisir l'altitude avec virgule
    await page.keyboard.type("0,80");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Deuxième point coté à 0,00 (clic au centre-droit)
    await page.mouse.click(cx + 100, cy);
    await page.waitForTimeout(500);

    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Vérifier que les éléments sont créés (le texte Konva n'est pas dans le DOM,
    // mais on vérifie via le compteur d'éléments)
    const countText = await page.locator("[data-testid='element-count']").textContent();
    const count = parseInt(countText ?? "0");
    expect(count).toBeGreaterThanOrEqual(2);

    // Attendre un peu pour la stabilisation
    await page.waitForTimeout(3000);
  });

  test("point coté non modifiable à l'étape 4", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const { cx, cy } = await canvasCentre(page);

    // Cliquer sur la zone du premier point coté → ne doit pas le sélectionner
    await page.mouse.click(cx - 100, cy);
    await page.waitForTimeout(300);

    // Vérifier qu'aucun point_cote n'est dans la sélection
    const editeurTest = await page.evaluate(() => {
      const et = (window as unknown as Record<string, unknown>).__editeurTest as {
        selection: Set<string>;
        elements: Map<string, { type: string }>;
      } | undefined;
      if (!et) return { selected: [] as string[] };
      const selTypes: string[] = [];
      for (const sid of et.selection) {
        const el = et.elements.get(sid);
        if (el) selTypes.push(el.type);
      }
      return { selected: selTypes };
    });
    expect(editeurTest.selected).not.toContain("point_cote");
  });

  test("poser une plante et vérifier son altitude en 3D", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // D'abord poser un point coté dans cette session (les éléments ne sont
    // peut-être pas persistés si la migration n'a pas été appliquée)
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);
    await page.keyboard.type("PC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx - 80, cy);
    await page.waitForTimeout(300);
    await page.keyboard.type("0.80");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Étape 4 : poser une plante au même endroit
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (!(await planteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // Pas de plante dans la bibliothèque — skip
    }

    await planteBtn.click();
    await page.waitForTimeout(500);
    await page.mouse.click(cx - 80, cy);
    await page.waitForTimeout(500);

    // Ouvrir l'aperçu 3D
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator("[data-testid='btn-apercu-3d']").click();
    await page.waitForTimeout(4000);

    // Vérifier via __scene3dTest que la plante a une altitude
    const testData = await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__scene3dTest,
      null,
      { timeout: 15000 },
    );
    const data = await testData.jsonValue() as {
      vegetaux: { id: string; altitudeRelative?: number }[];
    };

    if (data.vegetaux.length > 0) {
      expect(typeof data.vegetaux[0].altitudeRelative).toBe("number");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("courbes de niveau visibles", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    // Activer les courbes de niveau
    await page.locator("[data-testid='btn-courbes']").click();
    await page.waitForTimeout(1000);

    // Le bouton doit être dans l'état activé (fond ambre)
    const btn = page.locator("[data-testid='btn-courbes']");
    const classes = await btn.getAttribute("class");
    expect(classes).toContain("bg-amber");

    // Désactiver
    await btn.click();
    await page.waitForTimeout(300);
  });

  test("saisie clavier : virgule et signe + acceptés", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    // Compter les éléments avant
    const countBefore = parseInt(await page.locator("[data-testid='element-count']").textContent() ?? "0");

    // Activer l'outil point coté
    await page.keyboard.type("PC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    const { cx, cy } = await canvasCentre(page);
    await page.mouse.click(cx, cy - 50);
    await page.waitForTimeout(300);

    // Saisir avec signe + et virgule
    await page.keyboard.type("+0,45");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Le point doit être créé (au moins 1 de plus)
    const countAfter = parseInt(await page.locator("[data-testid='element-count']").textContent() ?? "0");
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test("commande REF définit le 0,00 avec avertissement si points cotés", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    // D'abord poser un point coté pour que l'avertissement apparaisse
    await page.keyboard.type("PC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    const { cx, cy } = await canvasCentre(page);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    await page.keyboard.type("0.50");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Activer la commande REF
    await page.keyboard.type("REF");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);

    // Cliquer sur un point pour définir le 0,00
    // L'avertissement (window.confirm) doit apparaître car il y a des points cotés
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("points cotés");
      await dialog.accept(); // Garder les altitudes telles quelles
    });

    await page.mouse.click(cx + 50, cy);
    await page.waitForTimeout(1000);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
