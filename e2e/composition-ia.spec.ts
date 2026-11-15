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

import fs from "fs";
import { test, expect, type Page } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
test.afterAll(nettoyageApres({ projets: "E2E-compo-", plantes: (p) => p.nom_latin.includes(`'E2E ${JETON}'`) }));

let projetId: string | null = null;
const MASSIF_ID = crypto.randomUUID();
const MASSIF_DERRIERE_ID = crypto.randomUUID();
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
/** Résultat de l'étape d'analyse, pour les vérifications. */
let derniereCompositionId: string | null = null;

/** Brief → analyse (validée) → palette → ajout à la bibliothèque → composition. */
async function composer(page: Page, bouton: string, captures: boolean, attendreReutilisation = false) {
  await page.locator(`[data-testid='${bouton}']`).click();
  const assistant = page.locator("[data-testid='assistant-composition']");
  await expect(assistant).toBeVisible();
  const choix = page.locator("[data-testid='choix-contour']");

  // Condition : le massif situé derrière la caméra n'est vu par aucune vue calée
  await choix.selectOption(MASSIF_DERRIERE_ID);
  await expect(page.locator("[data-testid='message-sans-vue']")).toHaveText("Calez d'abord au moins une vue qui montre le massif.");
  await expect(page.locator("[data-testid='btn-analyser']")).toBeDisabled();

  // Contour : le massif devant la caméra
  await choix.selectOption(MASSIF_ID);
  await expect(page.locator("[data-testid='message-sans-vue']")).toHaveCount(0);
  await page.locator("[data-testid='brief-description']").fill(`[e2e:${JETON}] Massif naturel lumineux, graminées et vivaces bleues et blanches, peu d'arrosage.`);
  await expect(page.locator("[data-testid='brief-climat']")).toHaveValue(/Île-de-France : étés de plus en plus chauds et secs/);
  await expect(page.locator("[data-testid='contexte-massif']")).toContainText("m²");
  if (captures) await page.screenshot({ path: "e2e/screenshots/composition-brief.png" });

  // Analyse des vues calées
  const reponseAnalyse = page.waitForResponse(
    // La première réponse peut être { ok: false, code: "images_requises" } (aussi en 200) :
    // attendre celle qui crée la composition
    async (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/compositions") && r.status() === 200
      && !!(await r.json().catch(() => null))?.compositionId,
    { timeout: 120_000 },
  );
  await page.locator("[data-testid='btn-analyser']").click();
  derniereCompositionId = (await (await reponseAnalyse).json()).compositionId;
  await expect(page.locator("[data-testid='etape-analyse']")).toBeVisible({ timeout: 60_000 });
  if (attendreReutilisation) {
    await expect(page.locator("[data-testid='analyse-reutilisee']")).toBeVisible();
  } else {
    // Validation : topiaire conservé (espèce corrigée, forme choisie), arbuste « à évaluer »
    // à trancher, pelouse = surface à remplacer (jamais proposée à la conservation)
    const existants = page.locator("[data-testid='existant']");
    await expect(existants).toHaveCount(3);
    await expect(existants.nth(2).locator("[data-testid='existant-surface']")).toHaveText("Surface à remplacer");
    await expect(existants.nth(2).locator("[data-testid='existant-conserver']")).toHaveCount(0);
    // Composition bloquée tant qu'un élément est à évaluer
    await expect(page.locator("[data-testid='message-a-evaluer']")).toContainText("1 élément à évaluer");
    await expect(page.locator("[data-testid='btn-valider-analyse']")).toBeDisabled();
    await existants.nth(0).locator("[data-testid='existant-espece']").fill("Taxus baccata (if)");
    await expect(existants.nth(0).locator("[data-testid='existant-ajouter-plan']")).toBeChecked();
    await expect(existants.nth(0).locator("[data-testid='existant-forme']")).toHaveValue("boule");
    await existants.nth(0).locator("[data-testid='existant-forme']").selectOption("cone");
    await existants.nth(1).locator("[data-testid='existant-supprimer']").click();
    await expect(existants.nth(1).locator("[data-testid='existant-decision']")).toHaveAttribute("data-recommandation", "supprimer");
    await expect(page.locator("[data-testid='message-a-evaluer']")).toHaveCount(0);
    await expect(page.locator("[data-testid='btn-valider-analyse']")).toBeEnabled();
    if (captures) await page.screenshot({ path: "e2e/screenshots/composition-analyse.png" });
  }
  await page.locator("[data-testid='btn-valider-analyse']").click();

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
    // Second massif 8 m DERRIÈRE la caméra : aucune vue calée ne le voit
    const derriere = (l: number, d: number): [number, number] => [cam.x + v[0] * l - u[0] * (8 + d), cam.y + v[1] * l - u[1] * (8 + d)];
    const massifDerriere = [derriere(-2, -1), derriere(2, -1), derriere(2, 1), derriere(-2, 1)];
    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [
          { id: MASSIF_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 1, geometrie: { type: "polygone", points: massifPoints } },
          { id: MASSIF_DERRIERE_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 2, geometrie: { type: "polygone", points: massifDerriere } },
        ],
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
    expect(apres.length).toBe(avant + compo.length + 1); // + 1 : le végétal existant validé
    for (const e of compo) expect(dansPolygone(e.geometrie.position!, massifPoints)).toBe(true);
    // Aucun conflit d'écartement dans le panneau Conflits après composition
    await expect(page.locator("[data-testid='panneau-conflits']")).toHaveCount(0);

    // L'existant validé (« Ajouter au plan ») est sur le plan, au statut « existant »
    const existantsPlan = apres.filter((e) => (e as unknown as { statut: string }).statut === "existant");
    expect(existantsPlan.length).toBe(1);
    expect(existantsPlan[0].proprietes.nom_latin).toBe("Taxus baccata");

    // Aucune plante composée dans l'emprise de l'existant conservé (cercle à son diamètre) ;
    // la pelouse (surface à remplacer) et l'arbuste supprimé n'excluent rien
    const exclusions = await page.evaluate(() => ((window as unknown as Record<string, unknown>).__compositionTest as { exclusions: { centre: [number, number]; rayon: number }[] }).exclusions);
    expect(exclusions.length).toBe(1);
    expect(existantsPlan[0].proprietes.forme_existant).toBe("cone");
    expect(exclusions[0].centre).toEqual(existantsPlan[0].geometrie.position);
    for (const e of compo) {
      const [x, y] = e.geometrie.position!;
      for (const c of exclusions) expect(Math.hypot(x - c.centre[0], y - c.centre[1])).toBeGreaterThanOrEqual(c.rayon);
    }
    // Toute la surface est plantée : indicateur de couverture ≥ 85 % (densité standard)
    const couverture = await page.locator("[data-testid='couverture-surface']").textContent();
    expect(Number(couverture?.match(/(\d+) %/)?.[1])).toBeGreaterThanOrEqual(85);

    // Images réellement envoyées au modèle
    for (const nom of ["plan", "vue-1"]) {
      const img = await page.request.get(`/api/conception/projets/${projetId}/compositions/${derniereCompositionId}/images/${nom}`);
      expect(img.ok(), `image ${nom}`).toBeTruthy();
      expect(img.headers()["content-type"]).toBe("image/jpeg");
      fs.writeFileSync(`e2e/screenshots/analyse-${nom}.jpg`, await img.body());
    }
    const parEspece = new Set(compo.map((e) => e.proprietes.plante_id));
    expect(parEspece.size).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/composition-plan.png" });

    // « Autre proposition » : même nombre de plantes, positions différentes, toujours une seule action
    const positions1 = compo.map((e) => e.geometrie.position).sort().join(";");
    await page.locator("[data-testid='btn-autre-proposition']").click();
    // La palette est d'abord revérifiée (appel serveur) : attendre la nouvelle proposition
    await expect.poll(async () => (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id)
      .map((e) => e.geometrie.position).sort().join(";"), { timeout: 10_000 }).not.toBe(positions1);
    const compo2 = (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id);
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
    }, compo2.length + avant, { timeout: 30000 }); // le végétal existant (sur le plan) n'est jamais rendu dans le Visuel
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/composition-visuel.png" });
    await page.locator("[data-testid='btn-retour-visuel']").click();

    // Cmd+Z à l'étape 4 : toute la composition disparaît en une fois
    await page.locator("[data-testid='etape-4']").click();
    await page.waitForTimeout(500);
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await plantesDuPlan(page)).filter((e) => e.proprietes.composition_id).length).toBe(0);
    // Seule la composition est annulée : l'existant validé (action distincte) reste sur le plan
    expect((await plantesDuPlan(page)).length).toBe(avant + 1);
    // Laisser la sauvegarde différentielle enregistrer l'annulation avant de fermer la page
    await page.waitForTimeout(4000);
  });

  test("depuis le Visuel : remplacement confirmé d'une composition existante, Cmd+Z la restaure", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    // Première composition (étape 4), gardée et enregistrée
    await page.locator("[data-testid='etape-4']").click();
    await composer(page, "btn-composer-ia", false, true); // même contour, mêmes vues : analyse réutilisée
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
    await composer(page, "btn-composer-ia-visuel", false, true);
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


  test("cas réel : composition existante + plante sans image → messages clairs, aucune erreur 500", async ({ page }) => {
    // Toute réponse serveur ≥ 500 pendant le parcours fait échouer le test
    const erreurs500: string[] = [];
    page.on("response", (r) => { if (r.status() >= 500) erreurs500.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });

    // Plante validée SANS image, en tête de la bibliothèque (la palette simulée la retient)
    const creee = await page.request.post("/api/conception/plantes", {
      data: { nom_commun: "Achillée (test)", nom_latin: `Achillea millefolium 'E2E ${JETON}'`, categorie: "vivace", largeur_adulte_m: 0.5, hauteur_adulte_m: 0.6 },
    });
    const planteId = (await creee.json()).id as string;
    expect(planteId).toBeTruthy();
    expect((await page.request.patch(`/api/conception/plantes/${planteId}`, { data: { statut: "validee" } })).ok()).toBeTruthy();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    await page.locator("[data-testid='etape-4']").click();
    await page.locator("[data-testid='btn-composer-ia']").click();
    await page.locator("[data-testid='choix-contour']").selectOption(MASSIF_ID);
    await page.locator("[data-testid='brief-description']").fill(`[e2e:${JETON}] Massif de vivaces.`);
    const reponseAnalyse = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/compositions") && r.status() === 200,
      { timeout: 120_000 },
    );
    await page.locator("[data-testid='btn-analyser']").click();
    const compositionId = (await (await reponseAnalyse).json()).compositionId as string;
    await expect(page.locator("[data-testid='etape-analyse']")).toBeVisible({ timeout: 60_000 });
    await page.locator("[data-testid='btn-valider-analyse']").click();
    await expect(page.locator("[data-testid='etape-palette']")).toBeVisible({ timeout: 30_000 });

    // Message clair dans la barre du bas, composition impossible
    await expect(page.locator("[data-testid='message-sans-images']")).toContainText("Achillée (test) n'a pas d'image. Régénérer ?");
    await expect(page.locator("[data-testid='btn-composer']")).toBeDisabled();
    await page.screenshot({ path: "e2e/screenshots/composition-plante-sans-image.png" });

    // La route refuse aussi, avec un code et un message explicites (jamais 500)
    const refus = await page.request.post(`/api/conception/projets/${projetId}/compositions/${compositionId}/intention`, { data: { plantes: [planteId] } });
    expect(refus.status()).toBe(409);
    const corps = await refus.json();
    expect(corps.code).toBe("images_manquantes");
    expect(corps.error).toBe("Achillée (test) n'a pas d'image.");

    // Régénérer, puis composer : la composition existante est signalée
    await page.locator("[data-testid='btn-regenerer-images']").click();
    await expect(page.locator("[data-testid='message-sans-images']")).toHaveCount(0, { timeout: 120_000 });
    await expect(page.locator("[data-testid='btn-composer']")).toBeEnabled();
    await page.locator("[data-testid='btn-composer']").click();
    await expect(page.locator("[data-testid='message-composition-existante']")).toHaveText("Une composition existe déjà sur ce massif. La remplacer ?");
    await page.screenshot({ path: "e2e/screenshots/composition-existante.png" });
    await page.locator("[data-testid='btn-confirmer-remplacement']").click();
    await expect(page.locator("[data-testid='barre-composition']")).toBeVisible();
    await page.locator("[data-testid='btn-garder-composition']").click();

    expect(erreurs500, "réponses serveur en erreur 500").toEqual([]);
  });

  test("Visuel : une plante derrière un végétal existant est masquée, une plante devant reste visible", async ({ page }) => {
    // Caméra de la vue calée et axe de visée
    const pdv = await (await page.request.get(`/api/conception/projets/${projetId}/points-de-vue`)).json();
    const cam = pdv.points_de_vue[0].camera as { x: number; y: number; cap: number };
    const a = (cam.cap * Math.PI) / 180;
    const u: [number, number] = [Math.sin(a), Math.cos(a)];
    const v: [number, number] = [Math.cos(a), -Math.sin(a)];
    const pt = (d: number, l = 0): [number, number] => [cam.x + u[0] * d + v[0] * l, cam.y + u[1] * d + v[1] * l];

    // Une plante de la bibliothèque avec image
    const biblio = await (await page.request.get("/api/conception/plantes?statut=validee")).json();
    const plante = (biblio.plantes as { id: string; nom_commun: string; nom_latin: string; face_url: string | null; hauteur_adulte_m: number | null; largeur_adulte_m: number | null; categorie: string; updated_at: string }[])
      .find((p) => p.face_url && (p.hauteur_adulte_m ?? 1) <= 1.5)!;
    expect(plante).toBeTruthy();

    // Plan réduit au cas étudié : un if en cône (2,5 m, Ø 1,4 m) à 8 m de la caméra, une plante
    // derrière lui (10 m), une devant (6 m), une derrière mais décalée sur le côté (témoin)
    const { elements } = await (await page.request.get(`/api/conception/projets/${projetId}/elements`)).json();
    const vegetauxAvant = (elements as { id: string; type: string }[]).filter((e) => e.type === "vegetal").map((e) => e.id);
    const { projet } = await (await page.request.get(`/api/conception/projets/${projetId}`)).json();
    const vegetal = (id: string, position: [number, number]) => ({
      id, type: "vegetal", calque: "vegetal", statut: "nouveau", hauteur: plante.hauteur_adulte_m ?? 1, ordre: 50,
      geometrie: { type: "point", position },
      proprietes: {
        plante_id: plante.id, nom_commun: plante.nom_commun, nom_latin: plante.nom_latin, version: plante.updated_at,
        hauteur_m: plante.hauteur_adulte_m ?? 1, diametre_m: plante.largeur_adulte_m ?? 0.6, categorie: plante.categorie, rotation: 0,
      },
    });
    const IF_ID = crypto.randomUUID(), DERRIERE = crypto.randomUUID(), DEVANT = crypto.randomUUID(), COTE = crypto.randomUUID();
    const maj = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        suppressions: vegetauxAvant,
        upserts: [
          { id: IF_ID, type: "vegetal", calque: "existant", statut: "existant", hauteur: 2.5, ordre: 49,
            geometrie: { type: "point", position: pt(8) },
            proprietes: { nom_commun: "If (test)", nom_latin: "Taxus baccata", diametre_m: 1.4, hauteur_m: 2.5, categorie: "arbuste", forme: null, forme_existant: "cone", existant_analyse: true } },
          vegetal(DERRIERE, pt(10)), vegetal(DEVANT, pt(6)), vegetal(COTE, pt(10, 3)),
        ],
        updated_at: projet.elements_modifies_le ?? projet.updated_at,
      },
    });
    expect(maj.ok()).toBeTruthy();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(3000);
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(1000);
    await page.locator("[data-testid^='pdv-']").first().click();
    await expect(page.locator("[data-testid='vue-visuel']")).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[]; vegetauxAffiches: () => number; masquants: number } | undefined;
      return !!t && t.vegetaux.length === 3 && t.vegetauxAffiches() >= 3 && t.masquants === 1;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // Opacité du rendu 3D sur l'axe vertical de chaque plante (0 = la photo est visible)
    const h = plante.hauteur_adulte_m ?? 1;
    const opacite = (p: [number, number]) => page.evaluate(([x, y, hauteur]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        versEcran: (x: number, y: number, h: number) => [number, number] | null; alphaEn: (cx: number, cy: number) => number;
        altitudeEn: (x: number, y: number) => number;
      };
      // Hauteur absolue dans la scène : altitude du terrain au pied + fraction de la hauteur
      let max = 0;
      for (const f of [0.3, 0.45, 0.6]) {
        const e = t.versEcran(x, y, t.altitudeEn(x, y) + hauteur * f);
        if (e) max = Math.max(max, t.alphaEn(e[0], e[1]));
      }
      return max;
    }, [p[0], p[1], h] as [number, number, number]);

    expect(await opacite(pt(10)), "plante derrière l'if : masquée").toBe(0);
    expect(await opacite(pt(6)), "plante devant l'if : visible").toBeGreaterThan(0);
    expect(await opacite(pt(10, 3)), "plante derrière mais à côté de l'if : visible").toBeGreaterThan(0);
    await page.screenshot({ path: "e2e/screenshots/visuel-masquant.png" });
  });
});
