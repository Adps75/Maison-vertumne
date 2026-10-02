import type { Pt } from "../geo/plan";
import {
  dist,
  milieu,
  projectionSurSegment,
  intersectionSegments,
  cercleVersPolygone,
  arcVersPoints,
} from "../geo/plan";
import type { Element, Accrochage, TypeAccrochage, Geometrie } from "../types";

const TOLERANCE_PX = 10;

/** Extrait tous les segments d'une géométrie. */
function segmentsDe(geom: Geometrie): [Pt, Pt][] {
  const segments: [Pt, Pt][] = [];
  const pts = pointsDe(geom);
  const ferme = geom.type === "polygone" || geom.type === "rectangle";

  for (let i = 0; i < pts.length - 1; i++) {
    segments.push([pts[i], pts[i + 1]]);
  }
  if (ferme && pts.length > 2) {
    segments.push([pts[pts.length - 1], pts[0]]);
  }
  return segments;
}

/** Extrait les points d'affichage d'une géométrie. */
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

/** Extrait les extrémités d'une géométrie. */
function extremitesDe(geom: Geometrie): Pt[] {
  switch (geom.type) {
    case "polyligne":
    case "polygone":
    case "rectangle":
      return geom.points;
    case "cercle":
      return []; // Pas d'extrémité
    case "arc":
      return arcVersPoints(
        geom.centre[0], geom.centre[1], geom.rayon,
        geom.angleDebut, geom.angleFin, 32,
      ).filter((_, i, arr) => i === 0 || i === arr.length - 1);
    case "cote":
      return [geom.p1, geom.p2];
    case "point":
      return [geom.position];
  }
}

/** Trouve le meilleur accrochage dans la tolérance. */
export function trouverAccrochage(
  curseur: Pt,
  elements: Element[],
  parcellePoints: Pt[],
  batimentsPoints: Pt[][],
  zoom: number,
): Accrochage | null {
  const tolerance = TOLERANCE_PX / zoom; // Conversion pixels → mètres
  let meilleur: Accrochage | null = null;
  let meilleureDist = tolerance;

  const tester = (pt: Pt, type: TypeAccrochage) => {
    const d = dist(curseur, pt);
    if (d < meilleureDist) {
      meilleureDist = d;
      meilleur = { point: pt, type };
    }
  };

  // Sources de points : éléments + parcelle + bâtiments
  const tousElements = elements.map((e) => e.geometrie);
  const tousSegments: [Pt, Pt][] = [];

  // Parcelle
  for (let i = 0; i < parcellePoints.length; i++) {
    tester(parcellePoints[i], "extremite");
    const j = (i + 1) % parcellePoints.length;
    if (j !== i) {
      tousSegments.push([parcellePoints[i], parcellePoints[j]]);
      tester(milieu(parcellePoints[i], parcellePoints[j]), "milieu");
    }
  }

  // Bâtiments
  for (const bat of batimentsPoints) {
    for (let i = 0; i < bat.length; i++) {
      tester(bat[i], "extremite");
      const j = (i + 1) % bat.length;
      if (j !== i) {
        tousSegments.push([bat[i], bat[j]]);
        tester(milieu(bat[i], bat[j]), "milieu");
      }
    }
  }

  // Éléments
  for (const geom of tousElements) {
    // Centres
    if (geom.type === "cercle") {
      tester(geom.centre, "centre");
    } else if (geom.type === "arc") {
      tester(geom.centre, "centre");
    }

    // Extrémités
    for (const pt of extremitesDe(geom)) {
      tester(pt, "extremite");
    }

    // Segments + milieux
    const segs = segmentsDe(geom);
    for (const [a, b] of segs) {
      tousSegments.push([a, b]);
      tester(milieu(a, b), "milieu");
    }
  }

  // Points sur segment (si aucune extrémité/milieu trouvé)
  if (!meilleur) {
    for (const [a, b] of tousSegments) {
      const proj = projectionSurSegment(curseur, a, b);
      if (proj.t > 0.01 && proj.t < 0.99 && proj.distance < meilleureDist) {
        meilleureDist = proj.distance;
        meilleur = { point: proj.projection, type: "surSegment" };
      }
    }
  }

  // Intersections (coûteux, seulement si pas d'autre accrochage)
  if (!meilleur && tousSegments.length < 500) {
    for (let i = 0; i < tousSegments.length; i++) {
      for (let j = i + 1; j < tousSegments.length; j++) {
        const inter = intersectionSegments(
          tousSegments[i][0], tousSegments[i][1],
          tousSegments[j][0], tousSegments[j][1],
        );
        if (inter) {
          tester(inter, "intersection");
        }
      }
    }
  }

  return meilleur;
}

/** Contraint un point au mode orthogonal (0, 90, 180, 270) depuis une base. */
export function contrainteOrtho(base: Pt, curseur: Pt): Pt {
  const dx = Math.abs(curseur[0] - base[0]);
  const dy = Math.abs(curseur[1] - base[1]);

  if (dx > dy) {
    return [curseur[0], base[1]]; // Horizontal
  }
  return [base[0], curseur[1]]; // Vertical
}
