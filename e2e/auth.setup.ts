/**
 * Setup d'authentification pour les tests E2E.
 *
 * Nécessite les variables d'environnement (dans .env.local ou via le shell) :
 *   E2E_EMAIL — email du compte admin de test
 *   E2E_PASSWORD — mot de passe du compte admin de test
 *
 * Ce setup se connecte une fois et sauvegarde les cookies dans e2e/.auth/state.json
 * pour que les tests suivants soient déjà authentifiés.
 */

import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/state.json";

setup("connexion admin", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    console.log("⚠ E2E_EMAIL / E2E_PASSWORD non définis — tests auth ignorés");
    return;
  }

  await page.goto("/connexion");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Attendre la redirection vers /conception
  await page.waitForURL("**/conception", { timeout: 10_000 });
  await expect(page.locator("text=Projets")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
