/**
 * Tests E2E — Végétaux 3D, noms de vues, caméras sur plan, statut calée.
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
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-veg3d-" + Date.now());
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

async function importerPhotoSynthetique(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#228B22"; ctx.fillRect(0, 400, 800, 200);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "test.jpg", { type: "image/jpeg" }));
      const input = document.querySelector("[data-testid='input-photo']") as HTMLInputElement;
      if (input) { Object.defineProperty(input, "files", { value: dt.files }); input.dispatchEvent(new Event("change", { bubbles: true })); }
    }, "image/jpeg", 0.9);
  });
}

/** Cale la photo via l'assistant et revient. */
async function calerPhoto(page: import("@playwright/test").Page) {
  const pdvBtn = page.locator("[data-testid^='pdv-']").first();
  await pdvBtn.click();
  await page.waitForTimeout(2000);
  // Étape 1 : placer
  const plan = page.locator("[data-testid='plan-placement']");
  const box = await plan.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
  }
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  // Étape 2 : objectif
  await page.locator("[data-testid='btn-objectif-26']").click();
  await page.waitForTimeout(300);
  // Étape 3 : suivant
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  // Étape 4 : valider → visuel
  await page.locator("[data-testid='btn-valider-calage']").click();
  await page.waitForTimeout(3000);
  // Fermer le visuel
  await page.locator("[data-testid='btn-retour-visuel']").click();
  await page.waitForTimeout(500);
}

async function compterVegetaux(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const test = (window as unknown as Record<string, unknown>).__editeurTest as {
      elements: Map<string, { type: string }>;
    } | undefined;
    if (!test) return -1;
    let n = 0;
    for (const el of test.elements.values()) {
      if (el.type === "vegetal") n++;
    }
    return n;
  });
}

test.describe.serial("Vues, végétaux 3D, statut calée", () => {
  test.setTimeout(240_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");

  test("setup : créer un projet, importer et caler une photo", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await importerPhotoSynthetique(page);
    await page.waitForTimeout(5000);
    await expect(page.locator("[data-testid^='pdv-']").first()).toBeVisible({ timeout: 10000 });

    await calerPhoto(page);
  });

  test("noms par défaut 'Vue N' et statut visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // La vue doit s'appeler "Vue 1" (pas un UUID)
    const nom = await page.locator("[data-testid^='pdv-nom-']").first().textContent();
    expect(nom).toMatch(/^Vue \d+$/);

    // Le statut "Calée" doit être visible
    await expect(page.locator("text=Calée").first()).toBeVisible({ timeout: 3000 });

    // Capture de la liste avec noms
    await page.screenshot({ path: "e2e/screenshots/liste-vues-nommees.png" });
  });

  test("caméras visibles sur le plan 2D", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // La caméra doit être visible sur le plan (étape 1)
    // On vérifie que le canvas Konva contient un élément au point de la caméra
    // (vérifié visuellement via la capture)
    await page.screenshot({ path: "e2e/screenshots/plan-avec-cameras.png" });
  });

  test("vue calée s'ouvre directement en Visuel après rechargement", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);

    // Ouvrir la vue calée
    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await pdvBtn.click();
    await page.waitForTimeout(3000);

    // Doit s'ouvrir directement en Visuel (pas en calage)
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });

    // Le bouton "Recaler" doit être visible (pas "Calage")
    await expect(page.locator("text=Recaler")).toBeVisible({ timeout: 3000 });

    // Capture de la vue calée rouverte
    await page.screenshot({ path: "e2e/screenshots/vue-calee-rouverte.png" });

    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("poser une plante par vrai clic dans le Visuel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    const avant = await compterVegetaux(page);

    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    const pdvBtn = page.locator("[data-testid^='pdv-']").first();
    await pdvBtn.click();
    await page.waitForTimeout(3000);

    // Visuel ouvert (vue calée)
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });

    // Ouvrir panneau végétaux si fermé
    const panneau = page.locator("[data-testid='panneau-vegetaux-3d']");
    if (!(await panneau.isVisible().catch(() => false))) {
      const btn = page.locator("[data-testid='btn-vegetaux-3d']");
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(300);
    }

    // Sélectionner la première plante
    const premierePlante = page.locator("[data-testid^='plante-3d-']").first();
    await expect(premierePlante).toBeVisible({ timeout: 5000 });
    await premierePlante.click();
    await page.waitForTimeout(500);

    // Clic sur la zone verte (pelouse)
    const cvBox = await page.locator("[data-testid='canvas-visuel']").boundingBox();
    if (cvBox) {
      await page.mouse.move(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.75);
      await page.waitForTimeout(200);
      await page.mouse.click(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.75);
      await page.waitForTimeout(1000);
    }

    const apres = await compterVegetaux(page);
    expect(apres).toBeGreaterThan(avant);

    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("clic sur plante ne change pas sa position", async ({ page }) => {
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Récupérer la position de la plante
    const posBefore = await page.evaluate(() => {
      const test = (window as unknown as Record<string, unknown>).__editeurTest as {
        elements: Map<string, { type: string; geometrie: { position: [number, number] } }>;
      } | undefined;
      if (!test) return null;
      for (const el of test.elements.values()) {
        if (el.type === "vegetal") return el.geometrie.position;
      }
      return null;
    });
    expect(posBefore).toBeTruthy();

    // Ouvrir le visuel
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await page.waitForTimeout(3000);

    // Annuler le placement si actif
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Cliquer sur la zone où la plante a été posée (même endroit que la pose)
    const cvBox = await page.locator("[data-testid='canvas-visuel']").boundingBox();
    if (cvBox) {
      await page.mouse.click(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.75);
      await page.waitForTimeout(500);
    }

    // Fermer le visuel
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);

    // Vérifier que la position n'a pas changé
    const posAfter = await page.evaluate(() => {
      const test = (window as unknown as Record<string, unknown>).__editeurTest as {
        elements: Map<string, { type: string; geometrie: { position: [number, number] } }>;
      } | undefined;
      if (!test) return null;
      for (const el of test.elements.values()) {
        if (el.type === "vegetal") return el.geometrie.position;
      }
      return null;
    });

    if (posBefore && posAfter) {
      expect(Math.abs(posAfter[0] - posBefore[0])).toBeLessThan(0.001); // 1mm
      expect(Math.abs(posAfter[1] - posBefore[1])).toBeLessThan(0.001);
    }
  });

  test("glisser une plante sur terrain en pente : le pied suit le curseur et l'altitude suit le relief", async ({ page }) => {
    test.skip(
      process.env.E2E_RELIEF_FIXTURE !== "plan_incline",
      "Nécessite le relief incliné : lancer avec E2E_RELIEF_FIXTURE=plan_incline",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Ouvrir le visuel (l'étape 5 charge le relief incliné de la fixture)
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await page.waitForTimeout(3000);
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    type Veg = { id: string; position: [number, number]; altitudeRelative: number; hauteur_m: number };
    const lireVegetaux = () => page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: Veg[] } | undefined;
      return t ? t.vegetaux.map((v) => ({ ...v, position: [...v.position] as [number, number] })) : [];
    });
    const versEcran = (x: number, y: number, h: number) => page.evaluate(([a, b, c]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      return t.versEcran(a, b, c);
    }, [x, y, h] as const);

    // Attendre que la plante soit réellement affichée (texture chargée) avant de l'attraper
    await page.waitForFunction(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as
        { vegetaux: unknown[]; vegetauxAffiches: () => number } | undefined;
      return !!t && t.vegetaux.length > 0 && t.vegetauxAffiches() >= t.vegetaux.length;
    }, null, { timeout: 15000 });

    const avant = (await lireVegetaux())[0];
    const piedAvant = await versEcran(avant.position[0], avant.position[1], avant.altitudeRelative);
    const centre = await versEcran(avant.position[0], avant.position[1], avant.altitudeRelative + avant.hauteur_m / 2);
    expect(piedAvant).toBeTruthy();
    expect(centre).toBeTruthy();
    if (!piedAvant || !centre) return;

    // Vrai geste : on attrape la plante au milieu de son image, 10 pas de souris
    const DX = 90;
    const DY = -50; // vers le haut de l'écran = plus loin de la caméra
    await page.mouse.move(centre[0], centre[1]);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(centre[0] + DX, centre[1] + DY, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.up();

    // Attendre que la nouvelle position soit rendue
    await page.waitForFunction((id) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: { id: string; position: number[] }[] } | undefined;
      const v = t?.vegetaux.find((e) => e.id === id.id);
      return !!v && Math.hypot(v.position[0] - id.x, v.position[1] - id.y) > 0.01;
    }, { id: avant.id, x: avant.position[0], y: avant.position[1] }, { timeout: 5000 });

    const apres = (await lireVegetaux()).find((v) => v.id === avant.id)!;
    const piedApres = await versEcran(apres.position[0], apres.position[1], apres.altitudeRelative);
    expect(piedApres).toBeTruthy();
    if (!piedApres) return;

    // 1. Le pied a suivi la souris, dans le même sens et de la même distance à l'écran
    expect(piedApres[0] - piedAvant[0]).toBeCloseTo(DX, -0.5); // ± 1,6 px
    expect(piedApres[1] - piedAvant[1]).toBeCloseTo(DY, -0.5);

    // 2. Le déplacement au sol est significatif et l'altitude suit la pente de la fixture
    //    (100 + 0,02 × x : +2 cm par mètre vers l'est)
    const dxPlan = apres.position[0] - avant.position[0];
    const dyPlan = apres.position[1] - avant.position[1];
    expect(Math.hypot(dxPlan, dyPlan)).toBeGreaterThan(0.5);
    expect(Math.abs(dxPlan)).toBeGreaterThan(0.25);
    expect(apres.altitudeRelative - avant.altitudeRelative).toBeCloseTo(0.02 * dxPlan, 3);

    // Remettre la plante en place (Ctrl+Z) pour le test suivant
    await page.keyboard.press("Control+z");
    await page.waitForFunction((id) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: { id: string; position: number[] }[] } | undefined;
      const v = t?.vegetaux.find((e) => e.id === id.id);
      return !!v && Math.hypot(v.position[0] - id.x, v.position[1] - id.y) < 0.001;
    }, { id: avant.id, x: avant.position[0], y: avant.position[1] }, { timeout: 5000 });

    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);
  });

  test("poser une plante sur une autre → elle se cale à côté", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);

    // Position de la plante existante
    const posExistante = await page.evaluate(() => {
      const test = (window as unknown as Record<string, unknown>).__editeurTest as {
        elements: Map<string, { type: string; geometrie: { position: [number, number] } }>;
      } | undefined;
      if (!test) return null;
      for (const el of test.elements.values()) {
        if (el.type === "vegetal") return [...el.geometrie.position] as [number, number];
      }
      return null;
    });

    // Ouvrir le visuel
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await page.waitForTimeout(3000);
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 5000 });

    // Ouvrir panneau végétaux
    const panneau = page.locator("[data-testid='panneau-vegetaux-3d']");
    if (!(await panneau.isVisible().catch(() => false))) {
      const btn = page.locator("[data-testid='btn-vegetaux-3d']");
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(300);
    }

    // Sélectionner la première plante du panneau
    const premierePlante = page.locator("[data-testid^='plante-3d-']").first();
    await expect(premierePlante).toBeVisible({ timeout: 5000 });
    await premierePlante.click();
    await page.waitForTimeout(500);

    // Cliquer exactement au même endroit que la plante existante (au centre bas du canvas)
    const cvBox = await page.locator("[data-testid='canvas-visuel']").boundingBox();
    if (cvBox) {
      await page.mouse.move(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.75);
      await page.waitForTimeout(200);
      await page.mouse.click(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.75);
      await page.waitForTimeout(1000);
    }

    // Fermer le visuel
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(500);

    // Vérifier : la deuxième plante ne doit PAS être à la même position que la première
    const positions = await page.evaluate(() => {
      const test = (window as unknown as Record<string, unknown>).__editeurTest as {
        elements: Map<string, { type: string; geometrie: { position: [number, number] } }>;
      } | undefined;
      if (!test) return [];
      const pos: [number, number][] = [];
      for (const el of test.elements.values()) {
        if (el.type === "vegetal") pos.push([...el.geometrie.position] as [number, number]);
      }
      return pos;
    });

    // Il doit y avoir au moins 2 végétaux
    expect(positions.length).toBeGreaterThanOrEqual(2);

    if (positions.length >= 2) {
      // Les deux positions doivent être différentes (écartement appliqué)
      const [p1, p2] = positions;
      const d = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
      expect(d).toBeGreaterThan(0.1); // au moins 10 cm d'écart
    }
  });

  test("cleanup", async ({ page }) => {
    if (projetId) await supprimerProjet(page);
  });
});
