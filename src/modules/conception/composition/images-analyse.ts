/**
 * Images envoyées au modèle pour l'analyse des vues calées (navigateur) :
 * - le plan : orthophoto, contour du massif, plantes du projet, caméras (cône + nom),
 *   grille de repères étiquetée ;
 * - chaque vue : la photo, avec le contour et la même grille projetés au sol.
 * JPEG, 1 600 px au plus sur le grand côté.
 */

import type { Pt } from "../geo/plan";
import type { CameraParams } from "../camera/types";
import { creerProjecteur } from "../camera/projection";
import { nomColonne, toutesLesCases, traitsGrille, type Grille } from "./grille";
import { etiquettesProjetees, grilleProjetee, projeterLigne, type PointImage } from "./projection-vue";

export const COTE_MAX_IMAGE = 1600;
const ORANGE = "#FF8C00";

export interface VuePlanAnalyse {
  nom: string;
  camera: CameraParams;
  aspect: number;
}

export interface PlantePlanAnalyse {
  position: Pt;
  diametre: number;
  nom: string;
}

function chargerImage(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image indisponible : ${url}`));
    img.src = url;
  });
}

function versJpegBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Encodage JPEG impossible")); return; }
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] ?? "");
      lecteur.onerror = () => reject(new Error("Lecture de l'image impossible"));
      lecteur.readAsDataURL(blob);
    }, "image/jpeg", 0.85);
  });
}

function pastille(ctx: CanvasRenderingContext2D, texte: string, x: number, y: number, taille = 12) {
  ctx.font = `600 ${taille}px Archivo, Helvetica, Arial, sans-serif`;
  const l = ctx.measureText(texte).width;
  ctx.fillStyle = "rgba(20, 25, 22, 0.62)";
  ctx.fillRect(x - l / 2 - 3, y - taille / 2 - 2, l + 6, taille + 4);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texte, x, y + 0.5);
}

function traitDouble(ctx: CanvasRenderingContext2D, tracer: () => void, couleur: string, largeur: number) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = largeur + 1.5;
  ctx.beginPath(); tracer(); ctx.stroke();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = largeur;
  ctx.beginPath(); tracer(); ctx.stroke();
}

// ─── Plan ─────────────────────────────────────────────────────────────

export async function dessinerPlan(params: {
  grille: Grille;
  contour: Pt[];
  plantes: PlantePlanAnalyse[];
  vues: VuePlanAnalyse[];
  ortho: { url: string; emprise: [number, number, number, number] } | null;
}): Promise<string> {
  const { grille: g, contour, plantes, vues, ortho } = params;
  // Emprise : grille + caméras, marge 1,5 m
  let x0 = g.xMin, x1 = g.xMin + g.colonnes * g.pas, y1 = g.yMax, y0 = g.yMax - g.lignes * g.pas;
  for (const v of vues) {
    x0 = Math.min(x0, v.camera.x); x1 = Math.max(x1, v.camera.x);
    y0 = Math.min(y0, v.camera.y); y1 = Math.max(y1, v.camera.y);
  }
  x0 -= 1.5; x1 += 1.5; y0 -= 1.5; y1 += 1.5;
  const echelle = COTE_MAX_IMAGE / Math.max(x1 - x0, y1 - y0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((x1 - x0) * echelle);
  canvas.height = Math.round((y1 - y0) * echelle);
  const ctx = canvas.getContext("2d")!;
  const px = (p: Pt): [number, number] => [(p[0] - x0) * echelle, (y1 - p[1]) * echelle];

  const dessinerFond = async (avecOrtho: boolean) => {
    ctx.fillStyle = "#E9E5DA";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!avecOrtho || !ortho) return;
    const img = await chargerImage(ortho.url, true);
    const [ox0, oy0, ox1, oy1] = ortho.emprise;
    const [dx0, dy0] = px([ox0, oy1]);
    const [dx1, dy1] = px([ox1, oy0]);
    ctx.drawImage(img, dx0, dy0, dx1 - dx0, dy1 - dy0);
  };

  const dessinerCalques = () => {
    // Grille
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    for (const [a, b] of traitsGrille(g)) {
      const [ax, ay] = px(a), [bx, by] = px(b);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    const tailleCase = g.pas * echelle;
    if (tailleCase >= 34) {
      for (const c of toutesLesCases(g)) {
        const [cx, cy] = px(c.centre);
        ctx.font = `500 ${Math.min(12, tailleCase / 3.2)}px Archivo, Helvetica, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(c.texte, cx, cy);
      }
    }
    // Étiquettes de bord : lettres en haut et en bas, chiffres à gauche et à droite
    for (let col = 0; col < g.colonnes; col++) {
      const x = (g.xMin + (col + 0.5) * g.pas - x0) * echelle;
      pastille(ctx, nomColonne(col), x, (y1 - g.yMax) * echelle - 9);
      pastille(ctx, nomColonne(col), x, (y1 - (g.yMax - g.lignes * g.pas)) * echelle + 9);
    }
    for (let l = 0; l < g.lignes; l++) {
      const y = (y1 - (g.yMax - (l + 0.5) * g.pas)) * echelle;
      pastille(ctx, String(l + 1), (g.xMin - x0) * echelle - 11, y);
      pastille(ctx, String(l + 1), (g.xMin + g.colonnes * g.pas - x0) * echelle + 11, y);
    }
    // Plantes du projet
    for (const p of plantes) {
      const [cx, cy] = px(p.position);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, (p.diametre / 2) * echelle), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(64, 216, 112, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#40D870"; ctx.lineWidth = 1.5; ctx.stroke();
      if (p.nom) pastille(ctx, p.nom, cx, cy, 10);
    }
    // Contour du massif
    traitDouble(ctx, () => {
      contour.forEach((p, i) => { const [x, y] = px(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
    }, ORANGE, 3);
    // Caméras : cône de vision et nom
    const [mx, my] = contour.reduce((s, p) => [s[0] + p[0] / contour.length, s[1] + p[1] / contour.length], [0, 0]);
    for (const v of vues) {
      const demiAngle = Math.atan(Math.tan(((v.camera.fov_v || 50) * Math.PI) / 360) * v.aspect);
      const longueur = Math.max(4, Math.hypot(mx - v.camera.x, my - v.camera.y) * 1.15);
      const cap = (v.camera.cap * Math.PI) / 180;
      const pointe = (a: number): Pt => [v.camera.x + longueur * Math.sin(cap + a), v.camera.y + longueur * Math.cos(cap + a)];
      const [cx, cy] = px([v.camera.x, v.camera.y]);
      const [gx, gy] = px(pointe(-demiAngle)), [dx, dy] = px(pointe(demiAngle));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(gx, gy); ctx.lineTo(dx, dy); ctx.closePath();
      ctx.fillStyle = "rgba(37, 99, 235, 0.16)"; ctx.fill();
      ctx.strokeStyle = "#2563EB"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = "#2563EB"; ctx.fill();
      pastille(ctx, v.nom, cx, cy + 16, 12);
    }
    // Nord
    pastille(ctx, "N ↑", canvas.width - 26, 16, 13);
  };

  try {
    await dessinerFond(true);
    dessinerCalques();
    return await versJpegBase64(canvas);
  } catch {
    // Orthophoto indisponible ou non exportable : plan sans fond photographique
    await dessinerFond(false);
    dessinerCalques();
    return versJpegBase64(canvas);
  }
}

// ─── Vue calée ────────────────────────────────────────────────────────

export async function dessinerVue(params: {
  photoUrl: string;
  largeurPx: number;
  hauteurPx: number;
  camera: CameraParams;
  altitudeEn: (x: number, y: number) => number;
  grille: Grille;
  contour: Pt[];
}): Promise<string> {
  const { grille: g, contour, camera, altitudeEn } = params;
  const img = await chargerImage(params.photoUrl, false);
  const echelle = Math.min(1, COTE_MAX_IMAGE / Math.max(params.largeurPx, params.hauteurPx));
  const L = Math.round(params.largeurPx * echelle), H = Math.round(params.hauteurPx * echelle);
  const canvas = document.createElement("canvas");
  canvas.width = L; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, L, H);

  const projeter = creerProjecteur(camera, altitudeEn, L, H);
  const chemin = (pts: PointImage[]) => () => pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.u * L, p.v * H) : ctx.lineTo(p.u * L, p.v * H)));

  for (const t of grilleProjetee(g, projeter, altitudeEn)) traitDouble(ctx, chemin(t), "rgba(255, 255, 255, 0.85)", 1);
  for (const t of projeterLigne(contour, true, projeter, altitudeEn)) traitDouble(ctx, chemin(t), ORANGE, 2.5);
  for (const e of etiquettesProjetees(g, projeter, altitudeEn, L, H)) pastille(ctx, e.texte, e.u * L, e.v * H, 11);

  return versJpegBase64(canvas);
}
