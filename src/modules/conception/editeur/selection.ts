import type { Pt } from "../geo/plan";
import {
  dist,
  projectionSurSegment,
  pointDansPolygone,
  surface,
  cercleVersPolygone,
  arcVersPoints,
} from "../geo/plan";
import type { Element, Geometrie, Calque } from "../types";

const TOLERANCE_PX = 8;

// ===================== Hit-test géométrique =====================

interface HitResult {
  element: Element;
  distance: number; // Distance au curseur en mètres terrain
  surface: number; // Surface de l'élément (pour départager : le plus petit gagne)
}

/** Extrait les segments d'une géométrie pour le hit-test. */
function segmentsDe(geom: Geometrie): [Pt, Pt][] {
  const pts = pointsDe(geom);
  const segs: [Pt, Pt][] = [];
  const ferme =
    geom.type === "polygone" || geom.type === "rectangle" || geom.type === "cercle";

  for (let i = 0; i < pts.length - 1; i++) {
    segs.push([pts[i], pts[i + 1]]);
  }
  if (ferme && pts.length > 2) {
    segs.push([pts[pts.length - 1], pts[0]]);
  }
  return segs;
}

/** Points d'affichage d'une géométrie. */
function pointsDe(geom: Geometrie): Pt[] {
  switch (geom.type) {
    case "polyligne":
    case "polygone":
    case "rectangle":
      return geom.points;
    case "cercle":
      return cercleVersPolygone(geom.centre[0], geom.centre[1], geom.rayon, 64);
    case "arc":
      return arcVersPoints(
        geom.centre[0], geom.centre[1], geom.rayon,
        geom.angleDebut, geom.angleFin, 32,
      );
    case "cote":
      return [geom.p1, geom.p2];
    case "point":
      return [geom.position];
  }
}

/** Calcule la surface d'un élément (pour départager : le plus petit gagne). */
function surfaceDe(geom: Geometrie): number {
  switch (geom.type) {
    case "polygone":
    case "rectangle":
      return surface(geom.points);
    case "cercle":
      return Math.PI * geom.rayon * geom.rayon;
    default:
      return Infinity; // Polylignes et points → "infini" (ne gagnent pas par taille)
  }
}

/** Distance minimale du curseur à un élément (segments + intérieur). */
function distanceAElement(curseur: Pt, geom: Geometrie): number {
  // Point dans un polygone fermé → distance 0
  if (geom.type === "polygone" || geom.type === "rectangle") {
    if (pointDansPolygone(curseur, geom.points)) return 0;
  }
  if (geom.type === "cercle") {
    const d = dist(curseur, geom.centre);
    if (d <= geom.rayon) return 0;
  }

  // Distance au trait le plus proche
  const segs = segmentsDe(geom);
  let minDist = Infinity;
  for (const [a, b] of segs) {
    const proj = projectionSurSegment(curseur, a, b);
    if (proj.distance < minDist) minDist = proj.distance;
  }

  // Point isolé
  if (geom.type === "point") {
    minDist = dist(curseur, geom.position);
  }

  return minDist;
}

/**
 * Trouve l'élément sous le curseur.
 * Priorité : le plus petit polygone contenant le point, sinon le trait le plus proche.
 * Respecte la tolérance en pixels écran.
 */
export function hitTestGeometrique(
  curseur: Pt,
  elements: Element[],
  calques: Calque[],
  zoom: number,
): Element | null {
  const tolerance = TOLERANCE_PX / zoom;
  const calqueOk = new Set(
    calques.filter((c) => c.visible && !c.verrouille).map((c) => c.nom),
  );

  const candidats: HitResult[] = [];

  for (const el of elements) {
    if (!calqueOk.has(el.calque)) continue;

    const d = distanceAElement(curseur, el.geometrie);
    if (d <= tolerance) {
      candidats.push({
        element: el,
        distance: d,
        surface: surfaceDe(el.geometrie),
      });
    }
  }

  if (candidats.length === 0) return null;

  // Trier : les éléments "à l'intérieur" (distance 0) par surface croissante,
  // puis les éléments proches du trait par distance croissante.
  candidats.sort((a, b) => {
    if (a.distance === 0 && b.distance === 0) return a.surface - b.surface;
    if (a.distance === 0) return -1;
    if (b.distance === 0) return 1;
    return a.distance - b.distance;
  });

  return candidats[0].element;
}

/**
 * Trouve l'élément survolé (pour la surbrillance).
 * Même logique que hitTest mais renvoie juste l'id.
 */
export function elementSurvole(
  curseur: Pt,
  elements: Element[],
  calques: Calque[],
  zoom: number,
): string | null {
  const el = hitTestGeometrique(curseur, elements, calques, zoom);
  return el?.id ?? null;
}

// ===================== Sélection par rectangle =====================

/**
 * Sélection par rectangle.
 * gauche→droite : éléments entièrement inclus.
 * droite→gauche : éléments touchés (au moins un point dans le rectangle).
 */
export function selectionParRectangle(
  debut: Pt,
  fin: Pt,
  elements: Element[],
  calques: Calque[],
): string[] {
  const calqueOk = new Set(
    calques.filter((c) => c.visible && !c.verrouille).map((c) => c.nom),
  );

  const xMin = Math.min(debut[0], fin[0]);
  const xMax = Math.max(debut[0], fin[0]);
  const yMin = Math.min(debut[1], fin[1]);
  const yMax = Math.max(debut[1], fin[1]);

  // Direction : gauche→droite = strict (tous les points inclus)
  // droite→gauche = croisement (au moins un point touché)
  const strict = fin[0] >= debut[0];

  const ids: string[] = [];

  for (const el of elements) {
    if (!calqueOk.has(el.calque)) continue;

    const pts = pointsDe(el.geometrie);
    const dedans = pts.filter(
      (p) => p[0] >= xMin && p[0] <= xMax && p[1] >= yMin && p[1] <= yMax,
    );

    if (strict) {
      // Tous les points doivent être dans le rectangle
      if (dedans.length === pts.length) ids.push(el.id);
    } else {
      // Au moins un point touché
      if (dedans.length > 0) ids.push(el.id);
    }
  }

  return ids;
}
