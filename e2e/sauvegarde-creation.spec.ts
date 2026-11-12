/**
 * Tests E2E — Sauvegarde des éléments juste après la création d'un projet.
 *
 * Cas réel : la création d'un projet enregistre le relief en arrière-plan quelques
 * secondes après la réponse, ce qui modifie la ligne du projet. La page déjà ouverte ne
 * doit pas voir ses sauvegardes refusées pour « conflit » (migration 00024).
 */

import { test, expect, type Page } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-sauve-" }));

async function creerProjet(page: Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-sauve-" + Date.now());
  await page.locator('input[placeholder*="rue"]').fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  const sug = page.locator("li").first();
  if (!(await sug.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 60_000 });
  return page.url().match(/\/conception\/([a-f0-9-]+)/)?.[1] ?? null;
}

test.describe("Sauvegarde juste après la création du projet", () => {
  test.setTimeout(180_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("le relief enregistré en arrière-plan ne bloque pas la sauvegarde des éléments", async ({ page }) => {
    const projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();

    // Sans recharger la page : attendre que le relief soit enregistré en arrière-plan
    // (c'est ce qui modifiait la ligne du projet et provoquait le faux conflit)
    const reliefEnregistre = await expect.poll(async () => {
      const r = await page.request.get(`/api/conception/projets/${projetId}`);
      return (await r.json()).projet?.relief_path ?? null;
    }, { timeout: 60_000, intervals: [2000] }).not.toBeNull().then(() => true).catch(() => false);
    test.skip(!reliefEnregistre, "Relief IGN indisponible : le cas ne peut pas être reproduit");

    // Tracer un rectangle (commande REC) sur la page restée ouverte
    const canvas = page.locator("canvas").first();
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.keyboard.type("REC");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.mouse.click(cx - 40, cy - 30);
    await page.waitForTimeout(150);
    await page.mouse.click(cx + 40, cy + 30);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");

    // La sauvegarde aboutit (pas de conflit) et l'élément est bien en base
    const statut = page.locator("[data-testid='statut-sauvegarde']");
    await expect(statut).toHaveAttribute("data-statut", "sauvegarde", { timeout: 15_000 });
    const elements = await (await page.request.get(`/api/conception/projets/${projetId}/elements`)).json();
    expect((elements.elements ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
