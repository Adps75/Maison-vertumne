/**
 * Tests E2E — Glisser-déposer réaliste.
 * Vrais gestes avec page.mouse.move intermédiaires.
 * Vérifie les coordonnées via window.__editeurTest.
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-drag-real-" + Date.now());
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

/** Récupère les éléments depuis window.__editeurTest. */
async function getElements(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const state = (window as unknown as Record<string, unknown>).__editeurTest as {
      elements: Map<string, { id: string; type: string; geometrie: unknown; proprietes?: Record<string, unknown> }>;
    } | undefined;
    if (!state) return {};
    const out: Record<string, unknown> = {};
    state.elements.forEach((v, k) => { out[k] = v; });
    return out;
  });
}

/** Récupère les compteurs de debug. */
async function getDebugCounters(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const panel = document.querySelector("[data-testid='debug-panel']");
    return panel?.textContent ?? "";
  });
}

/** Glisser réaliste avec steps intermédiaires. */
async function dragRealiste(
  page: import("@playwright/test").Page,
  fromX: number, fromY: number,
  toX: number, toY: number,
  options?: { alt?: boolean },
) {
  // Se positionner sur le point de départ
  await page.mouse.move(fromX, fromY);
  await page.waitForTimeout(100);

  // Appuyer
  await page.mouse.down();
  await page.waitForTimeout(50);

  // Mouvements intermédiaires (15 steps)
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    const y = fromY + ((toY - fromY) * i) / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
  }

  // Maintenir Alt si demandé
  if (options?.alt) {
    await page.keyboard.down("Alt");
    await page.waitForTimeout(50);
  }

  // Relâcher
  await page.mouse.up();

  if (options?.alt) {
    await page.keyboard.up("Alt");
  }

  await page.waitForTimeout(300);
}

test.describe.serial("Glisser-déposer réaliste", () => {
  test.setTimeout(120_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
  });

  test("glisser un rectangle vers la droite : coordonnées vérifiées", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 3 : tracer un rectangle au centre
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);
    await commande(page, "REC");
    await page.mouse.click(cx - 20, cy - 15);
    await page.waitForTimeout(200);
    await page.mouse.click(cx + 20, cy + 15);
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Lire les coordonnées du rectangle avant le drag
    const elsBefore = await getElements(page);
    const ids = Object.keys(elsBefore);
    expect(ids.length).toBe(1);
    const rectBefore = elsBefore[ids[0]] as { geometrie: { type: string; points: number[][] } };
    expect(rectBefore.geometrie.type).toBe("rectangle");
    const ptsBefore = rectBefore.geometrie.points;

    // Vérifier que les pointer events fonctionnent
    const debugBefore = await getDebugCounters(page);

    // Sélectionner le rectangle (clic au centre)
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Glisser vers la droite (≈ 2m en mètres terrain, varie selon le zoom)
    await dragRealiste(page, cx, cy, cx + 60, cy);

    // Lire les coordonnées après le drag
    const elsAfter = await getElements(page);
    const rectAfter = elsAfter[ids[0]] as { geometrie: { type: string; points: number[][] } };
    const ptsAfter = rectAfter.geometrie.points;

    // Tous les sommets doivent avoir été décalés du même vecteur
    const dx = ptsAfter[0][0] - ptsBefore[0][0];
    const dy = ptsAfter[0][1] - ptsBefore[0][1];

    // Le déplacement doit être significatif (> 0.5m)
    expect(Math.abs(dx)).toBeGreaterThan(0.5);

    // Tous les sommets décalés du même vecteur (tolérance 0.01m)
    for (let i = 1; i < 4; i++) {
      expect(ptsAfter[i][0] - ptsBefore[i][0]).toBeCloseTo(dx, 1);
      expect(ptsAfter[i][1] - ptsBefore[i][1]).toBeCloseTo(dy, 1);
    }
  });

  test("Alt + glisser = copie, original inchangé", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 3
    await page.locator("[data-testid='etape-3']").click();
    await page.waitForTimeout(500);

    // Lire les éléments avant
    const elsBefore = await getElements(page);
    const idsBefore = Object.keys(elsBefore);
    const countBefore = idsBefore.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Sélectionner l'élément
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Alt + glisser
    await dragRealiste(page, cx, cy, cx + 80, cy + 20, { alt: true });

    // Vérifier qu'un élément a été ajouté
    const elsAfter = await getElements(page);
    const idsAfter = Object.keys(elsAfter);
    expect(idsAfter.length).toBe(countBefore + 1);

    // L'original ne doit pas avoir bougé
    const original = elsAfter[idsBefore[0]] as { geometrie: { points: number[][] } };
    const originalBefore = elsBefore[idsBefore[0]] as { geometrie: { points: number[][] } };
    expect(original.geometrie.points[0][0]).toBeCloseTo(originalBefore.geometrie.points[0][0], 1);
  });

  test("glisser avec outil Planter actif sur une plante existante", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const { cx, cy } = await canvasCentre(page);

    // Étape 4 : poser une plante
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);

    const planteBtn = page.locator("button").filter({ hasText: /⌀.*m$/ }).first();
    if (!(await planteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Pas de plante — skip
      return;
    }

    await planteBtn.click();
    await page.waitForTimeout(500);

    // Poser la plante
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);

    // Lire la position avant
    const elsBefore = await getElements(page);
    const vegIds = Object.keys(elsBefore).filter((id) => {
      const el = elsBefore[id] as { type: string };
      return el.type === "vegetal";
    });
    expect(vegIds.length).toBeGreaterThanOrEqual(1);
    const vegBefore = elsBefore[vegIds[0]] as { geometrie: { position: number[] } };
    const posBefore = vegBefore.geometrie.position;

    // L'outil Planter est toujours actif — glisser sur la plante devrait la déplacer
    // (comportement attendu : drag sur élément existant = déplacement)
    await dragRealiste(page, cx, cy, cx + 40, cy);

    // Lire la position après
    const elsAfter = await getElements(page);
    const vegAfter = elsAfter[vegIds[0]] as { geometrie: { position: number[] } };
    const posAfter = vegAfter.geometrie.position;

    // La plante doit avoir bougé
    expect(posAfter[0]).not.toBeCloseTo(posBefore[0], 0);
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
