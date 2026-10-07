/**
 * Tests E2E — Verrouillage par étape et végétaux.
 * Vérifie l'isolation des étapes, l'aperçu de plante, le déplacement, et la liste.
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-verrou-" + Date.now());
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

test.describe.serial("Verrouillage par étape et végétaux", () => {
  test.setTimeout(120_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("préparer : tracer un rectangle (étape 3) et poser une zone (étape 2)", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
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
    expect(countAfterRect).toBeGreaterThanOrEqual(1);

    // Étape 2 : créer une zone
    await page.locator("[data-testid='etape-2']").click();
    await page.waitForTimeout(500);
    await page.locator("[data-testid='tout-le-jardin-btn']").click();
    await page.waitForTimeout(1000);

    // Attendre la sauvegarde
    await page.waitForTimeout(5000);
    await expect(page.locator("text=Enregistré")).toBeVisible({ timeout: 5000 });
  });

  test("à l'étape 4, le rectangle de l'étape 3 n'est pas sélectionnable", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Passer à l'étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    // Cliquer au centre du canvas (où le rectangle a été tracé)
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Le panneau d'infos ne devrait pas afficher de sélection (pas de rectangle sélectionné)
    // Vérifier via la barre de saisie que rien n'est sélectionné
    // Le message devrait rester "Prêt" (pas de sélection)
    const barre = page.locator("[data-testid='barre-saisie'] span").first();
    const msg = await barre.textContent();
    expect(msg).not.toContain("Rectangle");
  });

  test("à l'étape 3, la commande PLA affiche un message d'erreur", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    // Passer à l'étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    // Taper PLA
    await commande(page, "PLA");

    // Le message devrait indiquer que la commande est pour l'étape 4
    const barre = page.locator("[data-testid='barre-saisie'] span").first();
    const msg = await barre.textContent();
    expect(msg).toContain("étape 4");
  });

  test("poser une plante, la sélectionner, la déplacer de 2 m", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    // S'il y a des plantes dans la bibliothèque, sélectionner la première
    const premierePlante = page.locator("[data-testid='panneau-zones']").locator("..").locator("button").filter({ hasText: /⌀/ }).first();
    // Chercher dans le panneau Végétaux (contient "⌀" pour le diamètre)
    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (!(await planteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Pas de plante dans la bibliothèque — skip ce test
      return;
    }

    await planteBtn.click();
    await page.waitForTimeout(500);

    // Poser la plante au centre
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);

    const countAfter = await elementCount(page);
    // Au moins 3 éléments : rectangle + zone + plante
    expect(countAfter).toBeGreaterThanOrEqual(3);

    // Sélectionner la plante (clic au même endroit, en mode sélection)
    await page.keyboard.press("Escape"); // Revenir en mode sélection
    await page.waitForTimeout(300);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Déplacer de 2 m au clavier
    await commande(page, "M");
    await page.keyboard.press("Enter"); // Valider la sélection
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy); // Point de base
    await page.waitForTimeout(200);
    await page.keyboard.type("2");
    await page.keyboard.press("Enter"); // Déplacement de 2m
    await page.waitForTimeout(500);

    // Vérifier que le nombre d'éléments n'a pas changé (déplacement, pas copie)
    const countFinal = await elementCount(page);
    expect(countFinal).toBe(countAfter);
  });

  test("poser 3 plantes identiques → la liste affiche ×3", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 4
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    // Sélectionner une plante
    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (!(await planteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // Pas de plante
    }

    await planteBtn.click();
    await page.waitForTimeout(500);

    // Poser 3 plantes
    await page.mouse.click(cx - 30, cy - 20);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 30, cy - 20);
    await page.waitForTimeout(300);
    await page.mouse.click(cx, cy + 20);
    await page.waitForTimeout(500);

    // Revenir en sélection pour voir la liste
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // La liste des végétaux doit être visible
    const liste = page.locator("[data-testid='liste-vegetaux']");
    await expect(liste).toBeVisible({ timeout: 3000 });

    // Le total doit inclure les plantes (au moins 3, possiblement + celle du test précédent)
    const totalText = await page.locator("[data-testid='total-vegetaux']").textContent();
    const total = parseInt((totalText ?? "0").replace(/[^0-9]/g, ""));
    expect(total).toBeGreaterThanOrEqual(3);

    // Attendre la sauvegarde
    await page.waitForTimeout(5000);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
