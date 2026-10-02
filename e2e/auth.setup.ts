/**
 * Setup d'authentification pour les tests E2E.
 * Charge E2E_EMAIL et E2E_PASSWORD depuis .env.test.local (via playwright.config.ts).
 * ÉCHOUE si la connexion ne fonctionne pas.
 */

import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/state.json";

setup("connexion admin", async ({ page }) => {
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL et E2E_PASSWORD doivent être définis dans .env.test.local.\n" +
      "Copier .env.test.example en .env.test.local et remplir les valeurs.",
    );
  }

  // 1. Aller sur /connexion et remplir le formulaire
  await page.goto("/connexion");
  await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 10_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // 2. Vérifier qu'un message d'erreur n'apparaît pas immédiatement (identifiants refusés)
  //    et attendre la redirection vers /conception
  await page.click('button[type="submit"]');

  // Attendre soit la redirection vers /conception, soit un message d'erreur
  try {
    // Attendre que l'URL ne soit plus /connexion (redirection vers /conception)
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/connexion"),
      { timeout: 15_000 },
    );
  } catch {
    // Pas redirigé — vérifier pourquoi
    const erreurVisible = await page.locator("text=Identifiants incorrects").isVisible().catch(() => false);
    if (erreurVisible) {
      await page.screenshot({ path: "test-results/auth-echec-identifiants.png" });
      throw new Error(
        "Identifiants refusés par Supabase. Vérifier E2E_EMAIL et E2E_PASSWORD dans .env.test.local.",
      );
    }

    // Toujours sur /connexion après la redirection (connexion OK mais pas admin)
    if (page.url().includes("/connexion")) {
      await page.screenshot({ path: "test-results/auth-echec-pas-admin.png" });
      throw new Error(
        "Connexion Supabase réussie mais accès à /conception refusé.\n" +
        "Le compte n'est probablement pas dans la table admins.\n" +
        "Exécuter : INSERT INTO admins (user_id) VALUES ('<user_id>');",
      );
    }

    await page.screenshot({ path: "test-results/auth-echec-timeout.png" });
    throw new Error(
      "Timeout lors de la connexion (15s). URL actuelle : " + page.url(),
    );
  }

  // 3. Confirmer qu'on est bien sur /conception
  await expect(page.getByRole("heading", { name: "Projets" })).toBeVisible({ timeout: 5_000 });

  // 4. Sauvegarder la session
  await page.context().storageState({ path: authFile });
});
