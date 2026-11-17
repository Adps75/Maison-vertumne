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
import fs from "fs";
import { couleursCarte, type Materiau } from "../src/modules/conception/materiaux/materiaux";

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
const RECT_ID = crypto.randomUUID();
const IF_ID = crypto.randomUUID();
/** If existant (cône de 2 m, Ø 1 m) devant le massif, à gauche : son pied ne doit rien recevoir. */
let ifPied: [number, number] = [0, 0];
const VOLIGE5_ID = crypto.randomUUID();
let gazonCentre: [number, number] = [0, 0];
/** Point du massif (paillage) à 1 m du centre, à côté de la plante. */
let massifTemoin: [number, number] = [0, 0];
/** Volige de 5 m dans le champ de la vue : extrémités, milieu, et un point de pelouse à côté. */
let volige5: { a: [number, number]; b: [number, number]; milieu: [number, number]; pelouse: [number, number] } | null = null;
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
  id: string; style: string; cout: number; masque_path: string | null; carte_path: string | null;
  consigne: string; consigne_style: string; references_utilisees: { id: string }[]; consignes_sup: string | null; annotations: boolean;
  base_id: string | null;
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
    // Massif en paillage d'écorce ; gazon rénové de 1,5 × 1,5 m à droite du massif (hors du massif) ;
    // volige de 5 m devant le massif ; derrière la caméra (hors du champ) : volige de 12,5 m, et un
    // rectangle de 10 × 4 m sans matériau (outils BOR et DEC)
    gazonCentre = pt(7, 3.2);
    massifTemoin = pt(7, 1);
    ifPied = pt(6.2, -3.2);
    volige5 = { a: pt(5, -2.5), b: pt(5, 2.5), milieu: pt(5, 0), pelouse: pt(5, 4) };
    const g = 0.75;
    const res = await page.request.patch(`/api/conception/projets/${projetId}/elements`, {
      data: {
        upserts: [
          { id: MASSIF_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, proprietes: { materiau_id: id("Paillage écorce de pin") }, ordre: 1,
            geometrie: { type: "polygone", points: [[cx - demi, cy - demi], [cx + demi, cy - demi], [cx + demi, cy + demi], [cx - demi, cy + demi]] } },
          { id: GAZON_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, ordre: 2, proprietes: { materiau_id: id("Gazon (rénovation)") },
            geometrie: { type: "polygone", points: [pt(7 - g, 3.2 - g), pt(7 - g, 3.2 + g), pt(7 + g, 3.2 + g), pt(7 + g, 3.2 - g)] } },
          { id: VOLIGE_ID, type: "limite", calque: "sols", statut: "nouveau", hauteur: null, ordre: 3, proprietes: { materiau_id: id("Volige acier") },
            geometrie: { type: "polyligne", points: [pt(-9, -4), pt(-9, 3.5), pt(-14, 3.5)] } },
          { id: VOLIGE5_ID, type: "limite", calque: "sols", statut: "nouveau", hauteur: null, ordre: 4, proprietes: { materiau_id: id("Volige acier") },
            geometrie: { type: "polyligne", points: [volige5.a, volige5.b] } },
          { id: IF_ID, type: "vegetal", calque: "existant", statut: "existant", hauteur: 2, ordre: 6,
            geometrie: { type: "point", position: ifPied },
            proprietes: { nom_commun: "If (test)", nom_latin: "Taxus baccata", diametre_m: 1, hauteur_m: 2, categorie: "arbuste", forme: null, forme_existant: "cone", existant_analyse: true } },
          { id: RECT_ID, type: "sol", calque: "sols", statut: "nouveau", hauteur: null, ordre: 5, proprietes: {},
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

  test("matériaux : quantitatif, bordures (BOR) sur des côtés choisis, découpe (DEC)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/conception/${projetId}`);
    await page.waitForTimeout(4000);
    await page.locator("[data-testid='etape-3']").click();
    const panneau = page.locator("[data-testid='panneau-materiaux']");
    await expect(panneau).toBeVisible();
    const quantite = (nom: string) => panneau.locator("[data-testid^='quantite-']", { hasText: nom }).locator("[data-testid='quantite-valeur']");
    await expect(quantite("Volige acier")).toHaveText("17,5 ml"); // 12,5 + 5
    await expect(quantite("Gazon (rénovation)")).toHaveText("2,25 m²");
    await expect(quantite("Paillage écorce de pin")).toHaveText("9 m²");

    // Cadrer le plan sur le rectangle (30 px/m)
    const elements = async () => page.evaluate(() => [...((window as unknown as Record<string, unknown>).__editeurTest as {
      elements: Map<string, { id: string; type: string; geometrie: { points?: [number, number][] }; proprietes: Record<string, unknown> }> }).elements.values()]);
    const rect = (await elements()).find((e) => e.id === RECT_ID)!;
    const pts = rect.geometrie.points!;
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
    await page.evaluate(([x, y]) => {
      const c = document.querySelector("[data-testid='canevas-container']")!;
      window.dispatchEvent(new CustomEvent("cadrer-zone", { detail: { zoom: 30, x: c.clientWidth / 2 - x * 30, y: c.clientHeight / 2 + y * 30 } }));
    }, [cx, cy] as [number, number]);
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, { zoom: number }>).__canevasTest.zoom)).toBe(30);
    const ecran = (p: [number, number]) => page.evaluate(([x, y]) =>
      (window as unknown as Record<string, { versEcran: (x: number, y: number) => [number, number] | null }>).__canevasTest.versEcran(x, y)!, p);
    const surCote = (i: number, t = 1 / 3): Promise<[number, number]> => {
      const a = pts[i], b = pts[(i + 1) % 4];
      return ecran([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    };
    const commande = async (c: string) => { await page.keyboard.type(c); await page.keyboard.press("Enter"); await page.waitForTimeout(200); };

    // BOR : surface, grand côté + petit côté (Maj), volige → 14 ml
    await commande("BOR");
    await expect(page.locator("[data-testid='panneau-bordure']")).toBeVisible();
    const centre = await ecran([cx, cy]);
    await page.mouse.click(centre[0], centre[1]);
    const c0 = await surCote(0), c1 = await surCote(1);
    await page.mouse.click(c0[0], c0[1]);
    await page.keyboard.down("Shift");
    await page.mouse.click(c1[0], c1[1]);
    await page.keyboard.up("Shift");
    await expect(page.locator("[data-testid='bordure-cotes']")).toHaveText("2 côtés · 14,00 ml");
    await page.locator("[data-testid^='bordure-materiau-']", { hasText: "Volige acier" }).locator("input").check();
    await page.screenshot({ path: "e2e/screenshots/materiaux-bordure.png" });
    await page.locator("[data-testid='btn-creer-bordure']").click();
    await expect(quantite("Volige acier")).toHaveText("31,5 ml"); // 17,5 + 14
    // Deuxième bordure, autre matériau, sur le côté opposé ; un côté déjà bordé est refusé
    const c2 = await surCote(2);
    await page.mouse.click(c2[0], c2[1]);
    await page.locator("[data-testid^='bordure-materiau-']", { hasText: "Bordure pierre" }).locator("input").check();
    await page.keyboard.press("Enter");
    await expect(quantite("Bordure pierre")).toHaveText("10 ml");
    await page.mouse.click(c0[0], c0[1]);
    await expect(page.locator("[data-testid='bordure-cotes']")).toContainText("Cliquez un côté");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const bordures = (await elements()).filter((e) => e.proprietes.bordure_de === RECT_ID);
    expect(bordures.length).toBe(2);
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/screenshots/materiaux-panneau.png" });

    // DEC : ligne en travers du rectangle (au tiers du grand côté) → deux surfaces, aires totales 40 m²
    await commande("DEC");
    await page.mouse.click(centre[0], centre[1]);
    const t1 = await ecran([pts[0][0] + (pts[1][0] - pts[0][0]) / 3 + (pts[0][0] - pts[3][0]) * 0.2, pts[0][1] + (pts[1][1] - pts[0][1]) / 3 + (pts[0][1] - pts[3][1]) * 0.2]);
    const t2 = await ecran([pts[3][0] + (pts[2][0] - pts[3][0]) / 3 - (pts[0][0] - pts[3][0]) * 0.2, pts[3][1] + (pts[2][1] - pts[3][1]) / 3 - (pts[0][1] - pts[3][1]) * 0.2]);
    await page.mouse.click(t1[0], t1[1]);
    await page.mouse.click(t2[0], t2[1]);
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-testid='barre-saisie']")).toContainText("surface découpée");
    const apres = await elements();
    const aire = (p: [number, number][]) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
    // Les deux parties : la surface d'origine (plus grande) et la nouvelle
    const parties = apres.filter((e) => e.type === "sol" && ![MASSIF_ID, GAZON_ID].includes(e.id) && e.geometrie.points);
    expect(parties.length).toBe(2);
    expect(parties.map((e) => e.id)).toContain(RECT_ID);
    expect(parties.reduce((s, e) => s + aire(e.geometrie.points!), 0)).toBeCloseTo(40, 6);
    expect(aire(parties.find((e) => e.id === RECT_ID)!.geometrie.points!)).toBeGreaterThan(20);
    // Les bordures suivent leurs côtés : longueurs inchangées
    await expect(quantite("Volige acier")).toHaveText("31,5 ml");
    await expect(quantite("Bordure pierre")).toHaveText("10 ml");
    // Cmd+Z : surface d'origine et bordures restaurées
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await elements()).filter((e) => e.type === "sol" && e.geometrie.points && Math.abs(aire(e.geometrie.points) - 40) < 1e-6).length).toBe(1);
    await expect(quantite("Volige acier")).toHaveText("31,5 ml");
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
    await expect(page.locator("[data-testid='avertissement-massif']")).toHaveCount(0); // massif en paillage
    await expect(page.locator("[data-testid='bloc-base']")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/rendu-styles.png" });

    await page.locator("[data-testid='style-realiste'] input").check();
    await expect(page.locator("[data-testid='option-annotations']")).toHaveCount(0);
    await expect(page.locator("[data-testid='mention-dessin-ia']")).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(`/api/conception/projets/${projetId}`)).json()).projet.rendu_style).toBe("realiste");
    await page.locator("[data-testid='style-croquis'] input").check();
    await expect.poll(async () => (await (await page.request.get(`/api/conception/projets/${projetId}`)).json()).projet.rendu_style).toBe("croquis");
  });

  test("Visuel : matériaux dessinés en 3D avant l'IA (volige de 5 m à sa position, paillage, gazon)", async ({ page }) => {
    await ouvrirVisuel(page);
    const opacite = (p: [number, number], h: number) => page.evaluate(([x, y, hauteur]) => {
      const t = (window as unknown as Record<string, unknown>).__visuelTest as {
        versEcran: (x: number, y: number, h: number) => [number, number] | null; alphaEn: (cx: number, cy: number) => number; altitudeEn: (x: number, y: number) => number;
      };
      const e = t.versEcran(x, y, t.altitudeEn(x, y) + hauteur);
      return e ? t.alphaEn(e[0], e[1]) : -1;
    }, [p[0], p[1], h] as [number, number, number]);
    // Textures chargées (ou couleur de repli) : laisser le temps du premier rendu
    await page.waitForTimeout(2000);
    expect(await opacite(volige5!.milieu, 0.03), "volige dessinée à sa position").toBeGreaterThan(0);
    expect(await opacite(volige5!.a, 0.03), "extrémité de la volige").toBeGreaterThan(0);
    expect(await opacite(volige5!.pelouse, 0.0), "pelouse à côté : photo seule").toBe(0);
    expect(await opacite(massifTemoin, 0.0), "paillage du massif dessiné").toBeGreaterThan(0);
    expect(await opacite(gazonCentre, 0.0), "gazon rénové dessiné").toBeGreaterThan(0);
    await page.screenshot({ path: "e2e/screenshots/visuel-materiaux.png" });
    // Bouton « Matériaux » : masqués à l'écran
    await page.locator("[data-testid='btn-materiaux-visuel']").click();
    expect(await opacite(volige5!.milieu, 0.03)).toBe(0);
    await page.locator("[data-testid='btn-materiaux-visuel']").click();
    expect(await opacite(volige5!.milieu, 0.03)).toBeGreaterThan(0);
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
    // La carte des matériaux accompagne la photo : légende des matériaux de la vue, aucune position en mots
    // La carte n'est jamais envoyée : aucune légende de couleurs ; matériaux nommés, sans position
    expect(rendu.consigne).not.toMatch(/MATERIAL MAP|red =|magenta/);
    expect(rendu.consigne).toContain("Gazon (rénovation)");
    expect(rendu.consigne).not.toMatch(/devant le massif|à droite du massif/);
    expect(rendu.carte_path).toBeTruthy();

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
    const [photo, image, masque, carte] = await Promise.all([
      brut(`${base}/image`, 4), brut(`${base}/rendus/${rendu.id}/image`, 4), brut(`${base}/rendus/${rendu.id}/image?type=masque`, 1),
      brut(`${base}/rendus/${rendu.id}/image?type=carte`, 4),
    ]);
    // Carte des matériaux : paillage uniquement dans le massif, gazon dans sa zone, noir ailleurs
    const biblio = await (await page.request.get("/api/conception/materiaux")).json();
    const couleurs = couleursCarte(biblio.materiaux as Materiau[]);
    const couleurDe = (nom: string) => couleurs.get((biblio.materiaux as Materiau[]).find((m) => m.nom === nom)!.id)!.rgb;
    const pixelCarte = async (p: [number, number]) => {
      const [x, y] = await pixelPhoto(page, p);
      const j = (y * carte.largeur + x) * 4;
      return [carte.data[j], carte.data[j + 1], carte.data[j + 2]];
    };
    expect(await pixelCarte(massifTemoin), "paillage dans le massif").toEqual(couleurDe("Paillage écorce de pin"));
    expect(await pixelCarte(gazonCentre), "gazon rénové").toEqual(couleurDe("Gazon (rénovation)"));
    expect(await pixelCarte(volige5!.pelouse), "pelouse hors massif : noir").toEqual([0, 0, 0]);
    expect(await pixelCarte(volige5!.milieu), "volige").toEqual(couleurDe("Volige acier"));
    fs.writeFileSync("e2e/screenshots/carte-materiaux.png", await sharp(Buffer.from(carte.data), { raw: { width: carte.largeur, height: carte.hauteur, channels: 4 } }).png().toBuffer());
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
    const [fx, fy] = await pixelPhoto(page, ifPied);
    expect(masque.data[fy * masque.largeur + fx], "pied de l'if existant : hors du masque").toBe(0);
    expect(masque.data[5 * masque.largeur + Math.round(masque.largeur / 2)], "ciel hors du masque").toBe(0);
    expect(hors).toBeGreaterThan(PHOTO.l * PHOTO.h / 3);
    expect(horsIdentiques).toBe(hors);
    expect(dedansModifies / dedans).toBeGreaterThan(0.9);
  });

  test("styles dessinés : base stylisée réutilisée, projet ajouté dans son masque, hors masque = base", async ({ page }) => {
    await ouvrirVisuel(page);
    await ouvrirPanneau(page);
    await page.locator("[data-testid='style-feutres'] input").check();
    await expect(page.locator("[data-testid='etat-base']")).toContainText("redessinée dans ce style");
    await generer(page, "feutres");
    await expect(page.locator("[data-testid='base-stylisee']")).toBeVisible({ timeout: 10000 });
    await generer(page, "feutres");
    const feutres = (await listeRendus(page)).filter((r) => r.style === "feutres");
    expect(feutres.length).toBe(2);
    // Une seule base pour les deux rendus ; le second ne la paie pas
    expect(feutres[0].base_id).toBeTruthy();
    expect(feutres[0].base_id).toBe(feutres[1].base_id);
    expect(Number(feutres[0].cout)).toBeLessThan(Number(feutres[1].cout)); // liste du plus récent au plus ancien
    const statut = await (await page.request.get(`/api/conception/projets/${projetId}/points-de-vue/${pdvId}/rendus/base?style=feutres`)).json();
    expect(statut.base.id).toBe(feutres[0].base_id);

    // Hors du masque : chaque pixel est celui de la base ; pied de l'if hors du masque ; plante dedans
    const base = `/api/conception/projets/${projetId}/points-de-vue/${pdvId}`;
    const brut = async (url: string, canaux: 1 | 4) => {
      const reponse = await page.request.get(url);
      expect(reponse.ok(), url).toBe(true);
      const buf = Buffer.from(await reponse.body());
      const img = canaux === 4 ? sharp(buf).ensureAlpha() : sharp(buf).extractChannel(0);
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return { data, buf, largeur: info.width, hauteur: info.height };
    };
    const id = feutres[0].id;
    const [imgBase, imgFinal, masque] = await Promise.all([
      brut(`${base}/rendus/${id}/image?type=base`, 4), brut(`${base}/rendus/${id}/image`, 4), brut(`${base}/rendus/${id}/image?type=masque`, 1),
    ]);
    let hors = 0, horsDifferents = 0;
    for (let i = 0; i < masque.data.length; i++) {
      if (masque.data[i] !== 0) continue;
      hors++;
      const j = i * 4;
      if (imgBase.data[j] !== imgFinal.data[j] || imgBase.data[j + 1] !== imgFinal.data[j + 1] || imgBase.data[j + 2] !== imgFinal.data[j + 2]) horsDifferents++;
    }
    expect(hors).toBeGreaterThan(PHOTO.l * PHOTO.h / 3);
    expect(horsDifferents, "pixels hors masque différents de la base").toBe(0);
    const [fx, fy] = await pixelPhoto(page, ifPied);
    expect(masque.data[fy * masque.largeur + fx], "pied de l'if existant").toBe(0);
    const [mx, my] = await pixelPhoto(page, massifTemoin);
    expect(masque.data[my * masque.largeur + mx], "paillage du massif").toBe(255);
    fs.writeFileSync("e2e/screenshots/dessin-base.png", imgBase.buf);
    fs.writeFileSync("e2e/screenshots/dessin-masque.png", masque.buf);
    fs.writeFileSync("e2e/screenshots/dessin-final.png", imgFinal.buf);

    // « Refaire la base » : nouvelle base
    await page.locator("[data-testid='btn-refaire-base']").click();
    await expect.poll(async () => (await (await page.request.get(`${base}/rendus/base?style=feutres`)).json()).base?.id, { timeout: 60_000 })
      .not.toBe(feutres[0].base_id);
    await page.screenshot({ path: "e2e/screenshots/dessin-panneau.png" });
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
    // Styles dessinés : la consigne enregistrée est celle de l'édition masquée sur la base
    expect(r1.consigne).toMatch(/Edit ONLY the transparent area/);
    expect(r1.base_id).toBeTruthy();
    expect(r2.base_id).toBeTruthy();
    expect(r1.base_id).not.toBe(r2.base_id); // une base par vue
    expect(r1.consigne_style).toMatch(/landscape architect's sketch/);
    expect(r1.consigne_style).toMatch(/STYLE REFERENCES? ONLY/);
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
    await expect(cartes.first()).toBeVisible({ timeout: 10000 });
    const nb = await cartes.count();

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
    await expect(cartes).toHaveCount(nb - 1, { timeout: 10000 });
    expect((await listeRendus(page)).length).toBe(nb - 1);
  });
});
