/**
 * Tests E2E — Rendu IA des vues, avec le fournisseur d'image simulé
 * (FOURNISSEUR_IMAGE=simule : aucun appel à OpenAI).
 *
 * Lancer : FOURNISSEUR_IMAGE=simule PORT=3001 npx playwright test e2e/rendu-ia.spec.ts
 * (sur un port sans serveur déjà lancé, pour que le serveur de test reçoive la variable).
 *
 * Captures : e2e/screenshots/rendu-styles.png, rendu-progression.png, rendu-liste.png,
 * materiaux-panneau.png, materiaux-proprietes.png.
 */

import { test, expect, type Page } from "@playwright/test";
import { nettoyageApres } from "./outils/nettoyage";
import sharp from "sharp";

test.use({ storageState: "e2e/.auth/state.json" });

// Données de test supprimées même si un test échoue (voir e2e/outils/nettoyage.ts)
// Références de style déposées par la suite : effacées après les projets (et leurs rendus)
const referencesCreees: string[] = [];
test.afterAll(nettoyageApres({ projets: "E2E-rendu-", referencesStyle: () => referencesCreees }));

let projetId: string | null = null;
let pdvId: string | null = null;
let pdv2Id: string | null = null;
const MASSIF_ID = crypto.randomUUID();
const GAZON_ID = crypto.randomUUID();
const VOLIGE_ID = crypto.randomUUID();
const BORDURE_ID = crypto.randomUUID();
let gazonCentre: [number, number] = [0, 0];
let massif: { cx: number; cy: number; demi: number } | null = null;
const PHOTO = { l: 800, h: 600 };
/** Coût calculé depuis la consommation fictive du fournisseur simulé (USAGE_SIMULE). */
const COUT_SIMULE = 0.1187;

async function creerProjet(page: Page) {
  await page.goto("/conception");
  await page.waitForTimeout(2000);
  if (page.url().includes("/connexion")) return null;
  await page.locator("text=Nouveau projet").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Optionnel"]').fill("E2E-rendu-" + Date.now());
  await page.locator('input[placeholder*="rue"]').fill("12 avenue Jean Moulin, Le Plessis-Robinson");
  // Géocodage data.geopf.fr : réponse parfois en 7 s ou plus
  const sug = page.locator("li").first();
  if (!(await sug.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false))) return null;
  await sug.click();
  await page.waitForTimeout(500);
  await page.click("text=Créer");
  await page.waitForURL("**/conception/*", { timeout: 60_000 });
  await page.waitForTimeout(5000);
  return page.url().match(/\/conception\/([a-f0-9-]+)/)?.[1] ?? null;
}

async function importerPhotoSynthetique(page: Page, nombre = 1): Promise<void> {
  await page.evaluate(([l, h, n]) => {
    const canvas = document.createElement("canvas");
    canvas.width = l; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, l, h);
    ctx.fillStyle = "#228B22"; ctx.fillRect(0, h * 2 / 3, l, h / 3);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dt = new DataTransfer();
      for (let i = 0; i < n; i++) dt.items.add(new File([blob], `test-${i + 1}.jpg`, { type: "image/jpeg" }));
      const input = document.querySelector("[data-testid='input-photo']") as HTMLInputElement;
      if (input) { Object.defineProperty(input, "files", { value: dt.files }); input.dispatchEvent(new Event("change", { bubbles: true })); }
    }, "image/jpeg", 0.95);
  }, [PHOTO.l, PHOTO.h, nombre] as const);
}

/** Lignes de la liste des vues (pdv-<uuid>, pas les boutons pdv-nom-…, pdv-rename-…). */
const lignesVues = (page: Page) => page.getByTestId(/^pdv-[0-9a-f]{8}-[0-9a-f]{4}-/);

async function calerPhoto(page: Page, indice = 0) {
  await lignesVues(page).nth(indice).click();
  await page.waitForTimeout(2000);
  const box = await page.locator("[data-testid='plan-placement']").boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.waitForTimeout(200);
  }
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  await page.locator("[data-testid='btn-objectif-26']").click();
  await page.waitForTimeout(300);
  await page.locator("[data-testid='btn-suivant']").click();
  await page.waitForTimeout(300);
  // Attendre l'enregistrement effectif du statut « calée »
  const enregistrement = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/points-de-vue\/[^/]+$/.test(new URL(r.url()).pathname)
      && (r.request().postData() ?? "").includes('"statut":"cale"'),
    { timeout: 60_000 },
  );
  await page.locator("[data-testid='btn-valider-calage']").click();
  expect((await enregistrement).ok()).toBeTruthy();
  await page.waitForTimeout(1000);
  await page.locator("[data-testid='btn-retour-visuel']").click();
  await page.waitForTimeout(500);
}

async function ouvrirVisuel(page: Page, indice = 0) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/conception/${projetId}`);
  await page.waitForTimeout(4000);
  await page.locator("[data-testid='etape-5']").click();
  const vue = lignesVues(page).nth(indice);
  await vue.waitFor({ state: "visible", timeout: 15000 });
  await vue.click();
  const visuel = page.locator("[data-testid='vue-visuel']");
  const calage = page.locator("[data-testid='vue-calage']");
  await expect(visuel.or(calage)).toBeVisible({ timeout: 15000 });
  expect(await calage.isVisible(), "La vue s'est ouverte en calage : elle n'est pas enregistrée comme calée").toBe(false);
  // Végétaux affichés (textures chargées)
  await page.waitForFunction(() => {
    const t = (window as unknown as Record<string, unknown>).__visuelTest as
      { vegetaux: unknown[]; vegetauxAffiches: () => number } | undefined;
    return !!t && t.vegetauxAffiches() >= t.vegetaux.length;
  }, null, { timeout: 30000 }); // textures via URL signées Supabase, parfois lentes
  await page.waitForTimeout(1000);
}

async function ouvrirPanneau(page: Page) {
  await page.locator("[data-testid='btn-rendu-ia']").click();
  await expect(page.locator("[data-testid='panneau-rendu-ia']")).toBeVisible();
}

/** Choisit le style du projet, lance une génération et attend le nouveau rendu dans la liste. */
async function generer(page: Page, style: string) {
  await page.locator(`[data-testid='style-${style}'] input`).check();
  const avant = await page.locator("[data-testid^='rendu-']").count();
  await page.locator("[data-testid='btn-generer']").click();
  await expect(page.locator("[data-testid='progression-rendu']")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[data-testid^='rendu-']")).toHaveCount(avant + 1, { timeout: 120_000 });
  // Génération entièrement terminée (boutons réactivés) avant de rendre la main
  await expect(page.locator("[data-testid='progression-rendu']")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("[data-testid='erreur-rendu']")).toHaveCount(0);
}

interface RenduApi {
  id: string; style: string; cout: number; masque_path: string | null;
  consigne: string; consigne_style: string; references_utilisees: { id: string }[]; consignes_sup: string | null; annotations: boolean;
}
async function listeRendus(page: Page, vue = pdvId): Promise<RenduApi[]> {
  const r = await page.request.get(`/api/conception/projets/${projetId}/points-de-vue/${vue}/rendus`);
  return (await r.json()).rendus as RenduApi[];
}

/** Opacité d'un pixel : valeur du masque d'un rendu au point plan donné (hauteur au sol). */
async function pixelPhoto(page: Page, p: [number, number]): Promise<[number, number]> {
  const ecran = await page.evaluate(([x, y]) => {
    const t = (window as unknown as Record<string, unknown>).__visuelTest as {
      altitudeEn: (x: number, y: number) => number;
      versEcran: (x: number, y: number, h: number) => [number, number] | null;
    };
    return t.versEcran(x, y, t.altitudeEn(x, y));
  }, p);
  const box = (await page.locator("[data-testid='canvas-visuel']").boundingBox())!;
  return [Math.round(((ecran![0] - box.x) * PHOTO.l) / box.width), Math.round(((ecran![1] - box.y) * PHOTO.h) / box.height)];
}

test.describe.serial("Rendu IA des vues (fournisseur simulé)", () => {
  test.setTimeout(300_000);
  test.skip(() => !process.env.E2E_EMAIL?.trim(), "E2E_EMAIL non défini");
  test.skip(() => process.env.FOURNISSEUR_IMAGE !== "simule", "Lancer avec FOURNISSEUR_IMAGE=simule (aucun appel réel)");

  test("setup : projet, deux photos calées, massif avec une plante, matériaux posés", async ({ page }) => {
    projetId = await creerProjet(page);
    expect(projetId).toBeTruthy();
    await page.locator("[data-testid='etape-5']").click();
    await page.waitForTimeout(2000);
    // Deux photos importées ensemble, puis calées l'une après l'autre
    await importerPhotoSynthetique(page, 2);
    await expect(lignesVues(page)).toHaveCount(2, { timeout: 20000 });
    await calerPhoto(page, 0);
    await calerPhoto(page, 1);

    const pdvData = await (await page.request.get(`/api/conception/projets/${projetId}/points-de-vue`)).json();
    const vues = pdvData.points_de_vue as { id: string; camera: { x: number; y: number; cap: number } }[];
    expect(vues.length).toBe(2);
    pdvId = vues[0].id;
    pdv2Id = vues[1].id;
    const vue = vues[0];
    const cap = (vue.camera.cap * Math.PI) / 180;
    const u: [number, number] = [Math.sin(cap), Math.cos(cap)];
    const v: [number, number] = [Math.cos(cap), -Math.sin(cap)];
    const pt = (d: number, l: number): [number, number] => [vue.camera.x + u[0] * d + v[0] * l, vue.camera.y + u[1] * d + v[1] * l];
    massif = { cx: vue.camera.x + 7 * u[0], cy: vue.camera.y + 7 * u[1], demi: 1.5 };
    const { cx, cy, demi } = massif;

    // Matériaux de l'atelier (migration 00025)
    const biblio = await (await page.request.get("/api/conception/materiaux")).json();
    const id = (nom: string) => (biblio.materiaux as { id: string; nom: string }[]).find((m) => m.nom === nom)?.id;
    expect(id("Gazon (rénovation)"), "Appliquer la migration 00025 (matériaux)").toBeTruthy();
    // Gazon rénové de 1,5 × 1,5 m à droite du massif (hors du massif) ; derrière la caméra (hors du
    // champ) : volige de 12,5 m, et bordure sur un rectangle de 10 × 4 m dont un grand côté est exclu
    gazonCentre = pt(7, 3.2);
    const g = 0.75;
    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [
          { id: MASSIF_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 1,
            geometrie: { type: "polygone", points: [[cx - demi, cy - demi], [cx + demi, cy - demi], [cx + demi, cy + demi], [cx - demi, cy + demi]] } },
          { id: GAZON_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, ordre: 2, proprietes: { materiau_id: id("Gazon (rénovation)") },
            geometrie: { type: "polygone", points: [pt(7 - g, 3.2 - g), pt(7 - g, 3.2 + g), pt(7 + g, 3.2 + g), pt(7 + g, 3.2 - g)] } },
          { id: VOLIGE_ID, type: "limite", calque: "sols", statut: "nouveau", hauteur: null, ordre: 3, proprietes: { materiau_id: id("Volige acier") },
            geometrie: { type: "polyligne", points: [pt(-9, -4), pt(-9, 3.5), pt(-14, 3.5)] } },
          { id: BORDURE_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, ordre: 4, proprietes: { materiau_id: id("Bordure pierre"), cotes_exclus: [0] },
            geometrie: { type: "rectangle", points: [pt(-2, -5), pt(-2, 5), pt(-6, 5), pt(-6, -5)] } },
        ],
        suppressions: [], updated_at: null,
      },
    });
    expect(res.ok()).toBeTruthy();

    // Poser une plante au centre du massif, par vrai clic
    await ouvrirVisuel(page);
    const panneau = page.locator("[data-testid='panneau-vegetaux-3d']");
    if (!(await panneau.isVisible().catch(() => false))) await page.locator("[data-testid='btn-vegetaux-3d']").click();
    const plante = page.locator("[data-testid^='plante-3d-']").first();
    await expect(plante).toBeVisible({ timeout: 15000 });
    await plante.click();
    const ecran = await page.evaluate(([x, y]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        altitudeEn: (x: number, y: number) => number;
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      return t.versEcran(x, y, t.altitudeEn(x, y));
    }, [cx, cy] as const);
    expect(ecran).toBeTruthy();
    await page.mouse.click(ecran![0], ecran![1]);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as { vegetaux: unknown[] } | undefined;
      return !!t && t.vegetaux.length === 1;
    }, null, { timeout: 5000 });
    // Laisser la sauvegarde différentielle enregistrer la plante
    await page.waitForTimeout(3000);
    await page.locator("[data-testid='btn-retour-visuel']").click();
    await page.waitForTimeout(2000);
  });

  test("matériaux : quantitatif du plan (ml et m²), choix dans Propriétés, clic sur un côté exclu", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    await page.locator("[data-testid='etape-3']").click();
    const panneau = page.locator("[data-testid='panneau-materiaux']");
    await expect(panneau).toBeVisible();
    const quantite = (nom: string) => panneau.locator("[data-testid^='quantite-']", { hasText: nom }).locator("[data-testid='quantite-valeur']");
    await expect(quantite("Volige acier")).toHaveText("12,5 ml");
    await expect(quantite("Gazon (rénovation)")).toHaveText("2,25 m²");
    await expect(quantite("Bordure pierre")).toHaveText("18 ml"); // 10 × 4 m, un grand côté exclu : 4 + 10 + 4
    await page.screenshot({ path: "e2e/screenshots/materiaux-panneau.png" });

    // Sélection de la bordure : matériau et quantité dans Propriétés, puis clic sur le côté exclu pour le réinclure
    await page.evaluate((id) => ((window as unknown as Record<string, unknown>).__editeurTest as { selectionner: (ids: string[]) => void }).selectionner([id]), BORDURE_ID);
    await expect(page.locator("[data-testid='select-materiau'] option:checked")).toHaveText("Bordure pierre");
    await expect(page.locator("[data-testid='info-quantite-materiau']")).toHaveText("18 ml");
    await expect(page.locator("[data-testid='aide-cotes']")).toContainText("1 exclu");
    const els = await page.evaluate(() => [...((window as unknown as Record<string, unknown>).__editeurTest as { elements: Map<string, { id: string; geometrie: { points: [number, number][] } }> }).elements.values()]);
    const bordure = els.find((e) => e.id === BORDURE_ID)!;
    const [a, b] = [bordure.geometrie.points[0], bordure.geometrie.points[1]];
    // Cadrer le plan sur la bordure (30 px/m), puis clic sur le côté 0 au tiers
    // (le milieu porte la poignée d'ajout de sommet)
    const pts = bordure.geometrie.points;
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
    await page.evaluate(([x, y]) => {
      const c = document.querySelector("[data-testid='canevas-container']")!;
      const z = 30;
      window.dispatchEvent(new CustomEvent("cadrer-zone", { detail: { zoom: z, x: c.clientWidth / 2 - x * z, y: c.clientHeight / 2 + y * z } }));
    }, [cx, cy] as [number, number]);
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, { zoom: number }>).__canevasTest.zoom)).toBe(30);
    const versEcranPlan = (p: [number, number]) => page.evaluate(([x, y]) =>
      (window as unknown as Record<string, { versEcran: (x: number, y: number) => [number, number] | null }>).__canevasTest.versEcran(x, y), p);
    const clic = (await versEcranPlan([a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3]))!;
    await page.mouse.click(clic[0], clic[1]);
    await expect(page.locator("[data-testid='info-quantite-materiau']")).toHaveText("28 ml");
    await expect(quantite("Bordure pierre")).toHaveText("28 ml");
    await expect(page.locator("[data-testid='aide-cotes']")).not.toContainText("en pointillés");
    // Nouveau clic : le côté est de nouveau exclu, en pointillés
    await page.mouse.click(clic[0], clic[1]);
    await expect(quantite("Bordure pierre")).toHaveText("18 ml");
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/screenshots/materiaux-cote-exclu.png" });
    await page.keyboard.press("Control+z");
    await expect(quantite("Bordure pierre")).toHaveText("28 ml");
    await page.keyboard.press("Control+z");
    await expect(quantite("Bordure pierre")).toHaveText("18 ml");

    // Changer le matériau d'une surface depuis Propriétés : le quantitatif suit
    await page.evaluate((id) => ((window as unknown as Record<string, unknown>).__editeurTest as { selectionner: (ids: string[]) => void }).selectionner([id]), GAZON_ID);
    await expect(page.locator("[data-testid='select-materiau'] option:checked")).toHaveText("Gazon (rénovation)");
    await page.screenshot({ path: "e2e/screenshots/materiaux-proprietes.png" });
    await page.locator("[data-testid='select-materiau']").selectOption({ label: "Paillage écorce de pin" });
    await expect(quantite("Paillage écorce de pin")).toHaveText("2,25 m²");
    await expect(panneau.locator("[data-testid^='quantite-']", { hasText: "Gazon" })).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(quantite("Gazon (rénovation)")).toHaveText("2,25 m²");
    await page.waitForTimeout(3000); // sauvegarde différentielle
  });

  test("panneau : quatre styles, croquis par défaut, style enregistré sur le projet", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    for (const s of ["croquis", "aquarelle", "feutres", "realiste"]) await expect(page.locator(`[data-testid='style-${s}']`)).toBeVisible();
    await expect(page.locator("[data-testid='style-croquis'] input")).toBeChecked();
    await expect(page.locator("[data-testid='style-croquis']")).toContainText("Croquis d'architecte paysagiste");
    await expect(page.locator("[data-testid='option-annotations']")).not.toBeChecked();
    await expect(page.locator("[data-testid='cout-estime']")).toContainText("€");
    await expect(page.locator("[data-testid='mention-dessin-ia']")).toHaveText("L'IA peut modifier certains détails");
    await expect(page.locator("[data-testid='materiaux-rendu']")).toContainText("Gazon (rénovation)");
    await page.screenshot({ path: "e2e/screenshots/rendu-styles.png" });

    await page.locator("[data-testid='style-realiste'] input").check();
    await expect(page.locator("[data-testid='option-annotations']")).toHaveCount(0);
    await expect(page.locator("[data-testid='mention-dessin-ia']")).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(`/api/conception/projets/${projetId}`)).json()).projet.rendu_style).toBe("realiste");
    await page.locator("[data-testid='style-croquis'] input").check();
    await expect.poll(async () => (await (await page.request.get(`/api/conception/projets/${projetId}`)).json()).projet.rendu_style).toBe("croquis");
  });

  test("réaliste : masque avec le gazon rénové hors du massif, le reste est la photo d'origine", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    await page.locator("[data-testid='style-realiste'] input").check();
    const avant = await page.locator("[data-testid^='rendu-']").count();
    await page.locator("[data-testid='btn-generer']").click();
    await expect(page.locator("[data-testid='progression-rendu']")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/rendu-progression.png" });
    await expect(page.locator("[data-testid^='rendu-']")).toHaveCount(avant + 1, { timeout: 120_000 });
    await expect(page.locator("[data-testid='erreur-rendu']")).toHaveCount(0);

    const rendu = (await listeRendus(page)).find((r) => r.style === "realiste")!;
    expect(rendu.masque_path).toBeTruthy();
    // La consigne décrit le gazon rénové, inclus dans la zone retouchée
    expect(rendu.consigne).toContain("Inside the transparent area, also render these project materials");
    expect(rendu.consigne).toContain("Gazon (rénovation)");
    expect(rendu.consigne).toMatch(/à droite du massif/);
    expect(rendu.consigne).not.toContain("Volige acier"); // hors du champ de la vue

    // Pied de la plante, en pixels de la photo
    const pied = await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        vegetaux: { position: [number, number]; altitudeRelative: number }[];
        versEcran: (x: number, y: number, h: number) => [number, number] | null;
      };
      const v = t.vegetaux[0];
      return t.versEcran(v.position[0], v.position[1], v.altitudeRelative);
    });
    const box = (await page.locator("[data-testid='canvas-visuel']").boundingBox())!;
    const px = Math.round(((pied![0] - box.x) * PHOTO.l) / box.width);
    const py = Math.round(((pied![1] - box.y) * PHOTO.h) / box.height) - 3;
    const [gx, gy] = await pixelPhoto(page, gazonCentre);

    // Comparaison dans Node avec sharp, le décodeur du serveur : stricte, sans tolérance
    const base = `/api/conception/projets/${projetId}/points-de-vue/${pdvId}`;
    const brut = async (url: string, canaux: 1 | 4) => {
      const reponse = await page.request.get(url);
      const type = reponse.headers()["content-type"] ?? "";
      expect(reponse.ok() && type.startsWith("image/"), `${url} → ${reponse.status()} ${type} ${(await reponse.text()).slice(0, 200)}`).toBe(true);
      const buf = Buffer.from(await reponse.body());
      const img = canaux === 4 ? sharp(buf).rotate().ensureAlpha() : sharp(buf).extractChannel(0);
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return { data, largeur: info.width, hauteur: info.height };
    };
    const [photo, image, masque] = await Promise.all([
      brut(`${base}/image`, 4), brut(`${base}/rendus/${rendu.id}/image`, 4), brut(`${base}/rendus/${rendu.id}/image?type=masque`, 1),
    ]);
    let hors = 0, horsIdentiques = 0, dedans = 0, dedansModifies = 0;
    for (let i = 0; i < masque.data.length; i++) {
      const j = i * 4;
      const ecart = Math.abs(photo.data[j] - image.data[j]) + Math.abs(photo.data[j + 1] - image.data[j + 1]) + Math.abs(photo.data[j + 2] - image.data[j + 2]);
      if (masque.data[i] === 0) { hors++; if (ecart === 0) horsIdentiques++; }
      else if (masque.data[i] === 255) { dedans++; if (ecart > 60) dedansModifies++; }
    }
    expect([photo.largeur, photo.hauteur, image.largeur, image.hauteur, masque.largeur, masque.hauteur]).toEqual([PHOTO.l, PHOTO.h, PHOTO.l, PHOTO.h, PHOTO.l, PHOTO.h]);
    expect(masque.data[py * masque.largeur + px], "pied de la plante dans le masque").toBe(255);
    expect(masque.data[gy * masque.largeur + gx], "gazon rénové (hors du massif) dans le masque").toBe(255);
    expect(masque.data[5 * masque.largeur + Math.round(masque.largeur / 2)], "ciel hors du masque").toBe(0);
    expect(hors).toBeGreaterThan(PHOTO.l * PHOTO.h / 3);
    expect(horsIdentiques).toBe(hors);
    expect(dedansModifies / dedans).toBeGreaterThan(0.9);
  });

  test("même style sur deux vues : même consigne de style, mêmes références (déposées dans le panneau)", async ({ page }) => {
    await ouvrirVisuel(page, 0);
    await ouvrirPanneau(page);
    await page.locator("[data-testid='style-croquis'] input").check();

    // Image de référence du croquis : déposée si le style en a moins de 3
    const refsAvant = (await (await page.request.get("/api/conception/styles/references")).json()).references.croquis as { id: string }[];
    if (refsAvant.length < 3) {
      const ref = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#e8e1d0" } })
        .composite([{ input: Buffer.from('<svg width="320" height="200"><path d="M10 180 C 80 40, 160 40, 310 170" stroke="#3a2a1a" stroke-width="3" fill="none"/></svg>') }])
        .png().toBuffer();
      await page.locator("[data-testid='input-reference']").setInputFiles({ name: "croquis-reference.png", mimeType: "image/png", buffer: ref });
      await expect(page.locator("[data-testid^='reference-']")).toHaveCount(refsAvant.length + 1, { timeout: 15000 });
      const apres = (await (await page.request.get("/api/conception/styles/references")).json()).references.croquis as { id: string }[];
      referencesCreees.push(...apres.map((r) => r.id).filter((id) => !refsAvant.some((x) => x.id === id)));
    }
    const refs = ((await (await page.request.get("/api/conception/styles/references")).json()).references.croquis as { id: string }[]).map((r) => r.id);
    expect(refs.length).toBeGreaterThan(0);

    await page.locator("[data-testid='option-annotations']").check();
    await page.locator("[data-testid='consignes-sup']").fill("fin d'été, lumière douce du soir");
    await generer(page, "croquis");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/rendu-liste.png" });
    await page.locator("[data-testid='btn-fermer-rendu']").click();

    // Seconde vue : le style du projet est déjà le croquis
    await ouvrirVisuel(page, 1);
    await ouvrirPanneau(page);
    await expect(page.locator("[data-testid='style-croquis'] input")).toBeChecked();
    await expect(page.locator("[data-testid='option-annotations']")).toBeChecked();
    await generer(page, "croquis");

    const r1 = (await listeRendus(page, pdvId)).find((r) => r.style === "croquis")!;
    const r2 = (await listeRendus(page, pdv2Id)).find((r) => r.style === "croquis")!;
    // Même style, mêmes références sur les deux vues
    expect(r1.consigne_style).toBe(r2.consigne_style);
    expect(r1.references_utilisees.map((r) => r.id)).toEqual(refs);
    expect(r2.references_utilisees.map((r) => r.id)).toEqual(refs);
    expect(r1.consigne.startsWith(r1.consigne_style)).toBe(true);
    expect(r1.consigne_style).toMatch(/landscape architect's sketch/);
    expect(r1.consigne_style).toMatch(/STYLE REFERENCES ONLY/);
    // Le fournisseur simulé a reçu les références (jetons d'image en plus)
    expect(Number(r1.cout)).toBeGreaterThan(COUT_SIMULE);
    // Options de la vue 1 : annotations et consignes supplémentaires
    expect(r1.annotations).toBe(true);
    expect(r1.consignes_sup).toBe("fin d'été, lumière douce du soir");
    expect(r1.consigne).toMatch(/handwritten labels/);
    expect(r1.consigne).toContain("« fin d'été, lumière douce du soir »");
    // Trace des références dans la liste des rendus
    await expect(page.locator(`[data-testid='rendu-${r2.id}'] [data-testid='trace-references'] img`)).toHaveCount(refs.length);
  });

  test("téléchargement en PNG pleine résolution, puis suppression", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    const cartes = page.locator("[data-testid^='rendu-']");
    await expect(cartes).toHaveCount(2, { timeout: 10000 });

    const [telechargement] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      cartes.first().locator("[data-testid='btn-telecharger-rendu']").click(),
    ]);
    expect(telechargement.suggestedFilename()).toMatch(/\.png$/);
    const flux = await telechargement.createReadStream();
    const morceaux: Buffer[] = [];
    for await (const m of flux) morceaux.push(m as Buffer);
    const png = Buffer.concat(morceaux);
    // En-tête PNG : largeur et hauteur (octets 16 à 23)
    expect(png.readUInt32BE(16)).toBe(PHOTO.l);
    expect(png.readUInt32BE(20)).toBe(PHOTO.h);

    const supprimer = cartes.first().locator("[data-testid='btn-supprimer-rendu']");
    await supprimer.click();
    await expect(supprimer).toHaveText("Confirmer la suppression");
    await supprimer.click();
    await expect(cartes).toHaveCount(1, { timeout: 10000 });
    expect((await listeRendus(page)).length).toBe(1);
  });
});
