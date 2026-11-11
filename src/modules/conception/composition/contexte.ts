/**
 * Contexte d'un massif, calculé automatiquement — fonctions pures.
 */

import { surface, pointDansPolygone, projectionSurSegment, type Pt } from "../geo/plan";
import type { Contexte } from "./schemas";

export function centroide(contour: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < contour.length; i++) {
    const [x0, y0] = contour[i];
    const [x1, y1] = contour[(i + 1) % contour.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = contour.length;
    return [contour.reduce((s, p) => s + p[0], 0) / n, contour.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Dimensions et forme : longueur et largeur du plus petit rectangle orienté
 * (calipers sur les arêtes), forme déduite du rapport et du taux de remplissage.
 */
export function dimensionsEtForme(contour: Pt[]): Pick<Contexte, "surface_m2" | "longueur_m" | "largeur_m" | "forme"> {
  const aire = surface(contour);
  let meilleur = { aire: Infinity, l1: 0, l2: 0 };
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (n < 1e-9) continue;
    const u: Pt = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of contour) {
      const du = p[0] * u[0] + p[1] * u[1], dv = -p[0] * u[1] + p[1] * u[0];
      uMin = Math.min(uMin, du); uMax = Math.max(uMax, du);
      vMin = Math.min(vMin, dv); vMax = Math.max(vMax, dv);
    }
    const l1 = uMax - uMin, l2 = vMax - vMin;
    if (l1 * l2 < meilleur.aire) meilleur = { aire: l1 * l2, l1, l2 };
  }
  const longueur = Math.max(meilleur.l1, meilleur.l2);
  const largeur = Math.min(meilleur.l1, meilleur.l2);
  const remplissage = aire / Math.max(1e-9, meilleur.aire);
  const rapport = longueur / Math.max(1e-9, largeur);
  let forme: Contexte["forme"] = "irreguliere";
  if (remplissage > 0.72 && remplissage < 0.82 && rapport < 1.3) forme = "circulaire";
  else if (rapport >= 3) forme = "allongee";
  else if (remplissage >= 0.9) forme = "rectangulaire";
  return {
    surface_m2: Math.round(aire * 10) / 10,
    longueur_m: Math.round(longueur * 10) / 10,
    largeur_m: Math.round(largeur * 10) / 10,
    forme,
  };
}

/** Azimut (degrés, 0 = nord, 90 = est) du vecteur a → b en coordonnées plan (y = nord). */
export function azimut(a: Pt, b: Pt): number {
  const deg = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const CARDINAUX = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
export function cardinal(az: number): string {
  return CARDINAUX[Math.round(((az % 360) + 360) % 360 / 45) % 8];
}

export interface BatimentPlan {
  contour: Pt[];
  hauteur: number;
}

function pointLePlusProche(p: Pt, contour: Pt[]): { point: Pt; distance: number } {
  let meilleur = { point: contour[0], distance: Infinity };
  for (let i = 0; i < contour.length; i++) {
    const r = projectionSurSegment(p, contour[i], contour[(i + 1) % contour.length]);
    if (r.distance < meilleur.distance) meilleur = { point: r.projection, distance: r.distance };
  }
  return meilleur;
}

/** Plus courte distance entre deux polygones disjoints (0 s'ils se chevauchent). */
export function distanceEntreContours(a: Pt[], b: Pt[]): number {
  if (a.some((p) => pointDansPolygone(p, b)) || b.some((p) => pointDansPolygone(p, a))) return 0;
  let min = Infinity;
  for (const p of a) min = Math.min(min, pointLePlusProche(p, b).distance);
  for (const p of b) min = Math.min(min, pointLePlusProche(p, a).distance);
  return min;
}

/**
 * Exposition déduite des bâtiments : un bâtiment au sud du massif, proche par
 * rapport à sa hauteur, porte une ombre durable ; à l'est ou à l'ouest, une ombre
 * d'une demi-journée.
 */
export function exposition(contour: Pt[], batiments: BatimentPlan[]): Pick<Contexte, "exposition" | "detailExposition"> {
  const c = centroide(contour);
  let niveau = 0; // 0 soleil, 1 mi-ombre, 2 ombre
  const raisons: string[] = [];
  for (const b of batiments) {
    if (b.contour.length < 3 || pointDansPolygone(c, b.contour)) continue;
    // Direction du bâtiment vue depuis le centre du massif ; distance entre les contours
    const { point } = pointLePlusProche(c, b.contour);
    const az = azimut(c, point);
    const distance = distanceEntreContours(contour, b.contour);
    const h = b.hauteur > 0 ? b.hauteur : 6;
    const sud = az >= 120 && az <= 240;
    const estOuest = (az > 60 && az < 120) || (az > 240 && az < 300);
    if (sud && distance < 1.5 * h) {
      niveau = Math.max(niveau, 2);
      raisons.push(`bâtiment de ${Math.round(h)} m à ${distance.toFixed(1).replace(".", ",")} m au ${cardinal(az)} : ombre portée la plus grande partie de la journée`);
    } else if (sud && distance < 3 * h) {
      niveau = Math.max(niveau, 1);
      raisons.push(`bâtiment de ${Math.round(h)} m à ${distance.toFixed(1).replace(".", ",")} m au ${cardinal(az)} : ombre en hiver et en début et fin de journée`);
    } else if (estOuest && distance < h) {
      niveau = Math.max(niveau, 1);
      raisons.push(`bâtiment à ${distance.toFixed(1).replace(".", ",")} m à l'${az < 180 ? "est" : "ouest"} : ombre ${az < 180 ? "le matin" : "l'après-midi"}`);
    }
  }
  const expo = (["plein_soleil", "mi_ombre", "ombre"] as const)[niveau];
  return {
    exposition: expo,
    detailExposition: raisons.length > 0 ? raisons.join(" ; ") : "aucun bâtiment proche ne fait d'ombre au massif",
  };
}

/**
 * Pente moyenne du massif : plan des moindres carrés sur une grille de points
 * intérieurs. Null si le terrain est plat (< 1 %) ou sans relief.
 */
export function pente(contour: Pt[], altitudeEn: ((x: number, y: number) => number) | null): Contexte["pente"] {
  if (!altitudeEn) return null;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [x, y] of contour) {
    xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
  }
  const pas = Math.max(0.25, Math.max(xMax - xMin, yMax - yMin) / 20);
  // Moindres carrés : z = a x + b y + c
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let x = xMin; x <= xMax; x += pas) {
    for (let y = yMin; y <= yMax; y += pas) {
      if (!pointDansPolygone([x, y], contour)) continue;
      const z = altitudeEn(x, y);
      n++; sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
    }
  }
  if (n < 3) return null;
  const mx = sx / n, my = sy / n, mz = sz / n;
  const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
  const cxz = sxz / n - mx * mz, cyz = syz / n - my * mz;
  const det = cxx * cyy - cxy * cxy;
  if (Math.abs(det) < 1e-12) return null;
  const a = (cxz * cyy - cyz * cxy) / det;
  const b = (cyz * cxx - cxz * cxy) / det;
  const pourcent = Math.hypot(a, b) * 100;
  if (pourcent < 1) return null;
  // Descend dans la direction opposée au gradient
  const descend = azimut([0, 0], [-a, -b]);
  return { pourcent: Math.round(pourcent * 10) / 10, descendVers: cardinal(descend) };
}

export interface VuePlan {
  nom: string;
  position: Pt;
  calee: boolean;
}

/**
 * Devant du massif : direction du massif vers la vue principale (la vue calée la
 * plus proche) ; à défaut vers la façade la plus proche (on regarde le massif
 * depuis la maison) ; à défaut vers le sud.
 */
export function devantDuMassif(
  contour: Pt[],
  vues: VuePlan[],
  batiments: BatimentPlan[],
): { versDevant: Pt; devant: Contexte["devant"]; vuePrincipale: string | null } {
  const c = centroide(contour);
  const unitaire = (p: Pt): Pt => {
    const n = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
    return [(p[0] - c[0]) / n, (p[1] - c[1]) / n];
  };
  const calees = vues.filter((v) => v.calee);
  if (calees.length > 0) {
    const principale = calees.reduce((m, v) =>
      Math.hypot(v.position[0] - c[0], v.position[1] - c[1]) < Math.hypot(m.position[0] - c[0], m.position[1] - c[1]) ? v : m);
    return {
      versDevant: unitaire(principale.position),
      devant: { source: "vue", description: `devant tourné vers la vue « ${principale.nom} » (${cardinal(azimut(c, principale.position))})` },
      vuePrincipale: principale.nom,
    };
  }
  let proche: { point: Pt; distance: number } | null = null;
  for (const b of batiments) {
    if (b.contour.length < 3) continue;
    const r = pointLePlusProche(c, b.contour);
    if (!proche || r.distance < proche.distance) proche = r;
  }
  if (proche && proche.distance < 40) {
    return {
      versDevant: unitaire(proche.point),
      devant: { source: "facade", description: `devant tourné vers la façade la plus proche (${cardinal(azimut(c, proche.point))}, ${proche.distance.toFixed(1).replace(".", ",")} m)` },
      vuePrincipale: null,
    };
  }
  return { versDevant: [0, -1], devant: { source: "defaut", description: "devant tourné vers le sud (aucune vue ni façade proche)" }, vuePrincipale: null };
}

export interface PlanteExistante {
  position: Pt;
  nom_latin: string;
  nom_commun: string;
}

/** Plantes existantes dans le massif et à moins de `rayon` m autour. */
export function plantesAutour(contour: Pt[], plantes: PlanteExistante[], rayon = 5): Contexte["plantesExistantes"] {
  const sortie: Contexte["plantesExistantes"] = [];
  for (const p of plantes) {
    const dans = pointDansPolygone(p.position, contour);
    let d = 0;
    if (!dans) {
      d = Infinity;
      for (let i = 0; i < contour.length; i++) {
        d = Math.min(d, projectionSurSegment(p.position, contour[i], contour[(i + 1) % contour.length]).distance);
      }
    }
    if (dans || d <= rayon) {
      sortie.push({ nom_latin: p.nom_latin, nom_commun: p.nom_commun, dansMassif: dans, distance_m: Math.round(d * 10) / 10 });
    }
  }
  return sortie;
}
