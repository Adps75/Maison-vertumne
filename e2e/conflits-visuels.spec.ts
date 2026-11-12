/**
 * Test visuel : panneau Conflits dans le panneau Végétaux du projet.
 * Crée 20+ plantes proches pour déclencher des conflits, capture l'étape 4.
 */

import { test, expect } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-conflits-" }));

let projetId: string | null = null;

async function creerProjet(page: import("@playwright/test").Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-conflits-" + Date.now());
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

test.describe.serial("Panneau Conflits — vérification visuelle", () => {
  test.setTimeout(180_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup et captures", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();

    // Poser 24 plantes proches via l'API
    for (let i = 0; i < 24; i++) {
      const x = 5 + (i % 6) * 0.3;
      const y = 5 + Math.floor(i / 6) * 0.3;
      const response = await page.request.patch(
        `/api/conception/projets/${projetId}/elements`,
        {
          data: {
            upserts: [{
              id: crypto.randomUUID(),
              type: "vegetal",
              geometrie: { type: "point", position: [x, y] },
              calque: "vegetal",
              statut: "nouveau",
              hauteur: 1.5,
              proprietes: {
                plante_id: "test-plante",
                nom_commun: i < 12 ? "Perovskia" : "Sauge",
                nom_latin: i < 12 ? "Perovskia atriplicifolia" : "Salvia nemorosa",
                diametre_m: 1.0,
                hauteur_m: 1.5,
                categorie: "vivace",
                forme: null,
                version: "",
                rotation: 0,
              },
              ordre: i,
            }],
            suppressions: [],
            updated_at: null,
          },
        },
      );
      expect(response.ok()).toBeTruthy();
    }

    // Naviguer à l'étape 4
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(5000);

    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(2000);

    // Le panneau "Végétaux du projet" doit être visible
    await expect(page.locator("[data-testid='liste-vegetaux']")).toBeVisible({ timeout: 5000 });

    // Le compteur de conflits doit être visible (section fermée par défaut)
    await expect(page.locator("[data-testid='panneau-conflits']")).toBeVisible({ timeout: 5000 });
    const conflitText = await page.locator("[data-testid='btn-conflits-toggle']").textContent();
    expect(conflitText).toContain("conflit");

    // Capture 1 : panneau fermé
    await page.screenshot({ path: "e2e/screenshots/conflits-ferme.png" });

    // Ouvrir le panneau conflits
    await page.locator("[data-testid='btn-conflits-toggle']").click();
    await page.waitForTimeout(500);

    // Capture 2 : panneau ouvert
    await page.screenshot({ path: "e2e/screenshots/conflits-ouvert.png" });

    // Le plan doit rester visible (le panneau n'est pas en plein écran)
    // Vérifier que le canvas Konva est visible
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    if (canvasBox) {
      // Le canvas doit avoir une largeur significative (pas écrasé)
      expect(canvasBox.width).toBeGreaterThan(800);
    }
  });

});
