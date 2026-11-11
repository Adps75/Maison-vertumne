/**
 * Tests E2E — Composition automatique d'un massif par l'IA, avec l'IA simulée
 * (COMPOSITION_IA=simule) et le fournisseur d'images simulé (FOURNISSEUR_IMAGE=simule) :
 * aucun appel à Anthropic ni à OpenAI.
 *
 * Lancer : COMPOSITION_IA=simule FOURNISSEUR_IMAGE=simule PORT=3001 npx playwright test e2e/composition-ia.spec.ts
 *
 * Captures : e2e/screenshots/composition-brief.png, composition-palette.png,
 * composition-plan.png, composition-visuel.png.
 */

import { test, expect, type Page } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-compo-", plantes: (p) => p.nom_latin.includes(`'E2E ${JETON}'`) }));

let projetId: string | null = null;
const MASSIF_ID = crypto.randomUUID();
const JETON = `t${Date.now().toString(36)}`;
let massifPoints: [number, number][] = [];

async function creerProjet(page: Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-compo-" + Date.now());
  await page.locator('input[placeholder*="rue"]').fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  const sug = page.locator("li").first();
  if (!(await sug.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 60_000 });
  await page.waitForTimeout(5000);
  return page.url().match(/\/conception\/([a-f0-9-]+)/)?.[1] ?? null;
}

async function importerPhotoEtCaler(page: Page) {
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
    }, "image/jpeg", 0.95);
  });
  await expect(page.locator("[data-testid^='pdv-']").first()).toBeVisible({ timeout: 15000 });
  await page.locator("[data-testid^='pdv-']").first().click();
  await page.waitForTimeout(2000);
  const box = (await page.locator("[data-testid='plan-placement']").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
  await page.locator("[data-testid='btn-suivant']").click();
  await page.locator("[data-testid='btn-objectif-26']").click();
  await page.locator("[data-testid='btn-suivant']").click();
  const enregistrement = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/points-de-vue\/[^/]+$/.test(new URL(r.url()).pathname)
      && (r.request().postData() ?? "").includes('"statut":"cale"'),
    { timeout: 60_000 },
  );
  await page.locator("[data-testid='btn-valider-calage']").click();
  expect((await enregistrement).ok()).toBeTruthy();
  await page.waitForTimeout(1000);
  await page.locator("[data-testid='btn-retour-visuel']").click();
}

type ElTest = { id: string; type: string; geometrie: { position?: [number, number] }; proprietes: Record<string, unknown> };
async function plantesDuPlan(page: Page): Promise<ElTest[]> {
  return page.evaluate(() => {
    const t = (window as unknown as Record<string, unknown>).__editeurTest as { elements: Map<string, ElTest> } | undefined;
    return t ? [...t.elements.values()].filter((e) => e.type === "vegetal").map((e) => ({ ...e })) : [];
  });
}

function dansPolygone([x, y]: [number, number], poly: [number, number][]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Brief → palette → ajout à la bibliothèque → composition, depuis le bouton donné. */
async function composer(page: Page, bouton: string, captures: boolean) {
  await page.locator(`[data-testid='${bouton}']`).click();
  const assistant = page.locator("[data-testid='assistant-composition']");
  await expect(assistant).toBeVisible();
  // Contour : la surface dessinée (le massif)
  const choix = page.locator("[data-testid='choix-contour']");
  const option = choix.locator("option", { hasText: "Surface dessinée" }).first();
  await choix.selectOption((await option.getAttribute("value"))!);
  await page.locator("[data-testid='brief-description']").fill(`[e2e:${JETON}] Massif naturel lumineux, graminées et vivaces bleues et blanches, peu d'arrosage.`);
  await expect(page.locator("[data-testid='brief-climat']")).toHaveValue(/Île-de-France : étés de plus en plus chauds et secs/);
  await expect(page.locator("[data-testid='contexte-massif']")).toContainText("m²");
  if (captures) await page.screenshot({ path: "e2e/screenshots/composition-brief.png" });

  await page.locator("[data-testid='btn-proposer-palette']").click();
  await expect(page.locator("[data-testid='etape-palette']")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-testid='palette-retenue']").first()).toBeVisible();

  const ajout = page.locator("[data-testid='palette-ajout']");
  if (await ajout.count() > 0) {
    await expect(page.locator("[data-testid='btn-composer']")).toBeDisabled(); // images manquantes
    if (captures) await page.screenshot({ path: "e2e/screenshots/composition-palette.png" });
    await page.locator("[data-testid='btn-ajouter-bibliotheque']").click();
    await expect(page.locator("[data-testid='etat-ajout']").first()).toHaveText("✓ Ajoutée", { timeout: 120_000 });
  } else if (captures) {
    await page.screenshot({ path: "e2e/screenshots/composition-palette.png" });
  }
  await expect(page.locator("[data-testid='btn-composer']")).toBeEnabled({ timeout: 15000 });
  await page.locator("[data-testid='btn-composer']").click();
}

test.describe.serial("Composition IA (IA et images simulées)", () => {
  test.setTimeout(300_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");
  test.skip(() => process.env.COMPOSITION_IA !== "simule" || process.env.FOURNISSEUR_IMAGE !== "simule",
    "Lancer avec COMPOSITION_IA=simule FOURNISSEUR_IMAGE=simule (aucun appel réel)");

  test("setup : projet, vue calée, massif tracé devant la caméra", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    await importerPhotoEtCaler(page);

    const pdv = await (await page.request.get(`/api/conception/projets/${projetId}/points-de-vue`)).json();
    const cam = pdv.points_de_vue[0].camera as { x: number; y: number; cap: number };
    const a = (cam.cap * Math.PI) / 180;
    // Massif 6 m × 3 m centré 8 m devant la caméra, perpendiculaire à l'axe de visée
    const c: [number, number] = [cam.x + 8 * Math.sin(a), cam.y + 8 * Math.cos(a)];
    const u: [number, number] = [Math.sin(a), Math.cos(a)]; // axe de visée
    const v: [number, number] = [Math.cos(a), -Math.sin(a)]; // latéral
    const pt = (l: number, d: number): [number, number] => [c[0] + v[0] * l + u[0] * d, c[1] + v[1] * l + u[1] * d];
    massifPoints = [pt(-3, -1.5), pt(3, -1.5), pt(3, 1.5), pt(-3, 1.5)];
    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [{ id: MASSIF_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 1, geometrie: { type: "polygone", points: massifPoints } }],
        suppressions: [], updated_at: null,
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("brief → palette → composition : plantes sur le plan et dans le Visuel, Cmd+Z annule tout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(1000);
    const avant = (await plantesDuPlan(page)).length;

    await composer(page, "btn-composer-ia", true);

    // Barre de résultat, plantes posées dans le massif
    await expect(page.locator("[data-testid='barre-composition']")).toBeVisible({ timeout: 15000 });
    const apres = await plantesDuPlan(page);
    const compo = apres.filter((e) => e.proprietes.composition_id);
    expect(compo.length).toBeGreaterThan(5);
    expect(apres.length).toBe(avant + compo.length);
    for (const e of compo) expect(dansPolygone(e.geometrie.position!, massifPoints)).toBe(true);
    // Aucun conflit d'écartement dans le panneau Conflits après composition
    await expect(page.locator("[data-testid='panneau-conflits']")).toHaveCount(0);
    const parEspece = new Set(compo.map((e) => e.proprietes.plante_id));
    expect(parEspece.size).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/composition-plan.png" });

    // « Autre proposition » : même nombre de plantes, positions différentes, toujours une seule action
    const positions1 = compo.map((e) => e.geometrie.position).sort().join(";");
    await page.locator("[data-testid='btn-autre-proposition']").click();
    await page.waitForTimeout(500);
    const compo2 = (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id);
    expect(compo2.map((e) => e.geometrie.position).sort().join(";")).not.toBe(positions1);
    for (const e of compo2) expect(dansPolygone(e.geometrie.position!, massifPoints)).toBe(true);
    await page.locator("[data-testid='btn-garder-composition']").click();
    await expect(page.locator("[data-testid='barre-composition']")).toHaveCount(0);

    // Dans le Visuel (sans recharger : l'historique d'annulation est en mémoire)
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(1000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 15000 });
    await page.waitForFunction((n) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[]; vegetauxAffiches: () => number } | undefined;
      return !!t && t.vegetaux.length === n && t.vegetauxAffiches() >= n;
    }, compo2.length + avant, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/composition-visuel.png" });
    await page.locator("[data-testid='btn-retour-visuel']").click();

    // Cmd+Z à l'étape 4 : toute la composition disparaît en une fois
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id).length).toBe(0);
    expect((await plantesDuPlan(page)).length).toBe(avant);
    // Laisser la sauvegarde différentielle enregistrer l'annulation avant de fermer la page
    await page.waitForTimeout(4000);
  });

  test("depuis le Visuel : remplacement confirmé d'une composition existante, Cmd+Z la restaure", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    // Première composition (étape 4), gardée et enregistrée
    await page.locator("[data-testid='etape-4']").click();
    await composer(page, "btn-composer-ia", false);
    // Une composition du test précédent peut subsister en base : la remplacer si demandé
    const confirmer = page.locator("[data-testid='btn-confirmer-remplacement']");
    await expect(confirmer.or(page.locator("[data-testid='barre-composition']"))).toBeVisible({ timeout: 15000 });
    if (await confirmer.isVisible()) await confirmer.click();
    await page.locator("[data-testid='btn-garder-composition']").click();
    const premiere = (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id).map((e) => e.id).sort();
    expect(premiere.length).toBeGreaterThan(5);

    // Seconde composition depuis le Visuel, dans le même contour
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(1000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 15000 });
    await composer(page, "btn-composer-ia-visuel", false);
    await expect(page.locator("[data-testid='confirmer-remplacement']")).toBeVisible();
    await page.locator("[data-testid='btn-confirmer-remplacement']").click();
    await expect(page.locator("[data-testid='barre-composition']")).toBeVisible();
    const seconde = (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id).map((e) => e.id).sort();
    expect(seconde.length).toBeGreaterThan(5);
    expect(seconde.some((id) => premiere.includes(id))).toBe(false); // l'ancienne a été retirée

    // Cmd+Z dans le Visuel : l'ancienne composition revient, la nouvelle disparaît
    await page.locator("[data-testid='btn-garder-composition']").click();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id).map((e) => e.id).sort().join(","))
      .toBe(premiere.join(","));
  });

});
