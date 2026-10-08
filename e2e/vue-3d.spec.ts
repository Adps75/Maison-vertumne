/**
 * Tests E2E de la vue 3D (étape 5).
 *
 * Crée un projet de test avec un bâtiment (fourni par BD TOPO) et un végétal
 * de 1,20 m, puis vérifie que window.__scene3dTest expose les bonnes données.
 */

import { test, expect } from "@playwright/test";

test.use({
  storageState: "e2e/.auth/state.json",
});

let projetId: string | null = null;

// Coordonnées de la plante dans le repère du projet (mètres relatifs à l'origine)
const PLANTE_POSITION: [number, number] = [10, 10];
const PLANTE_HAUTEUR = 1.2;

async function creerProjetE2E(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/conception");
  await page.waitForTimeout(2000);

  if (page.url().includes("/connexion")) {
    throw new Error("Redirigé vers /connexion — la session auth n'est pas valide.");
  }

  const btn = page.locator("text=Nouveau projet");
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  const nomInput = page.locator('input[placeholder="Optionnel"]');
  await nomInput.fill("E2E-3d-" + Date.now());

  const adresseInput = page.locator('input[placeholder*="rue"]');
  await adresseInput.fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  await page.waitForTimeout(1500);

  const suggestion = page.locator("li").first();
  if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
    await suggestion.click();
    await page.waitForTimeout(500);
  } else {
    return null;
  }

  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  const match = url.match(/\/conception\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
}

async function supprimerProjetE2E(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(1000);

  const suppBtn = page.locator("text=Supprimer").first();
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

test.describe.serial("Vue 3D", () => {
  test.setTimeout(90_000);

  test("setup : créer un projet E2E avec un végétal", async ({ page }) => {
    projetId = await creerProjetE2E(page);
    expect(projetId, "Création du projet E2E échouée").toBeTruthy();

    // Ajouter un végétal via l'API PATCH elements
    const elementId = crypto.randomUUID();
    const element = {
      id: elementId,
      type: "vegetal",
      geometrie: { type: "point", position: PLANTE_POSITION },
      calque: "vegetal",
      statut: "nouveau",
      hauteur: PLANTE_HAUTEUR,
      proprietes: {
        plante_id: "e2e-fake-plante",
        nom_commun: "Buis E2E",
        nom_latin: "Buxus test",
        hauteur_m: PLANTE_HAUTEUR,
        diametre_m: 0.5,
        version: "2025-01-01T00:00:00Z",
      },
      ordre: 10,
    };

    const response = await page.request.patch(
      `/api/conception/projets/${projetId}/elements`,
      {
        data: {
          upserts: [element],
          suppressions: [],
          updated_at: null,
        },
      },
    );
    expect(response.ok(), `Ajout végétal échoué : ${await response.text()}`).toBeTruthy();
  });

  test("la scène 3D à l'étape 5 contient 1 bâtiment et 1 végétal de 1,20 m", async ({ page }) => {
    expect(projetId).toBeTruthy();

    // /3d redirige vers ?etape=5
    await page.goto(`/conception/${projetId}/3d`);
    await page.waitForURL(`**/conception/${projetId}?etape=5`, { timeout: 10000 });

    // Attendre que le canvas 3D soit visible
    const conteneur = page.locator("[data-testid='conteneur-3d']");
    await expect(conteneur).toBeVisible({ timeout: 15000 });
    const canvas = conteneur.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Attendre que window.__scene3dTest soit exposé
    const testData = await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__scene3dTest,
      null,
      { timeout: 15000 },
    );

    const data = await testData.jsonValue() as {
      batiments: number;
      surfaces: number;
      vegetaux: { id: string; position: [number, number]; hauteur_m: number }[];
    };

    // Le projet du Plessis-Robinson a au moins 1 bâtiment (maison BD TOPO)
    expect(data.batiments).toBeGreaterThanOrEqual(1);

    // Exactement 1 végétal
    expect(data.vegetaux).toHaveLength(1);
    expect(data.vegetaux[0].hauteur_m).toBe(PLANTE_HAUTEUR);
    expect(data.vegetaux[0].position[0]).toBe(PLANTE_POSITION[0]);
    expect(data.vegetaux[0].position[1]).toBe(PLANTE_POSITION[1]);

    // Le bouton vue piéton doit être visible
    const vuePieton = page.locator("[data-testid='btn-vue-pieton']");
    await expect(vuePieton).toBeVisible({ timeout: 5000 });
  });

  test("teardown : supprimer le projet E2E", async ({ page }) => {
    if (projetId) {
      await supprimerProjetE2E(page);
    }
  });
});
