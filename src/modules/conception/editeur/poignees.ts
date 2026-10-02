import type { Pt } from "../geo/plan";
import { dist, milieu } from "../geo/plan";
import type { Element, Geometrie } from "../types";
import { cercleVersPolygone, arcVersPoints } from "../geo/plan";

export type TypePoignee = "sommet" | "milieu" | "centre" | "rayon" | "arc_ext";

export interface Poignee {
  elementId: string;
  type: TypePoignee;
  index: number; // Index du sommet, ou -1 pour centre/rayon
  point: Pt;
}

/** Extrait toutes les poignées d'un élément. */
export function extrairePoignees(el: Element): Poignee[] {
  const poignees: Poignee[] = [];
  const geom = el.geometrie;

  switch (geom.type) {
    case "polyligne":
    case "polygone":
    case "rectangle":
      // Sommets
      for (let i = 0; i < geom.points.length; i++) {
        poignees.push({ elementId: el.id, type: "sommet", index: i, point: geom.points[i] });
      }
      // Milieux de segments
      for (let i = 0; i < geom.points.length; i++) {
        const j = (i + 1) % geom.points.length;
        // Pour polyligne ouverte, pas de segment entre le dernier et le premier
        if (geom.type === "polyligne" && j === 0 && i !== 0) continue;
        poignees.push({
          elementId: el.id,
          type: "milieu",
          index: i, // Milieu entre i et j
          point: milieu(geom.points[i], geom.points[j]),
        });
      }
      break;

    case "cercle":
      poignees.push({ elementId: el.id, type: "centre", index: -1, point: geom.centre });
      // Poignée sur le bord (à droite)
      poignees.push({
        elementId: el.id,
        type: "rayon",
        index: 0,
        point: [geom.centre[0] + geom.rayon, geom.centre[1]],
      });
      break;

    case "arc": {
      const pts = arcVersPoints(
        geom.centre[0], geom.centre[1], geom.rayon,
        geom.angleDebut, geom.angleFin, 32,
      );
      // Extrémités
      poignees.push({ elementId: el.id, type: "arc_ext", index: 0, point: pts[0] });
      poignees.push({ elementId: el.id, type: "arc_ext", index: 1, point: pts[pts.length - 1] });
      // Milieu de l'arc
      const midIdx = Math.floor(pts.length / 2);
      poignees.push({ elementId: el.id, type: "milieu", index: 0, point: pts[midIdx] });
      // Centre
      poignees.push({ elementId: el.id, type: "centre", index: -1, point: geom.centre });
      break;
    }

    case "point":
      poignees.push({ elementId: el.id, type: "centre", index: -1, point: geom.position });
      break;
  }

  return poignees;
}

/** Trouve la poignée la plus proche du curseur dans la tolérance. */
export function trouverPoignee(
  curseur: Pt,
  poignees: Poignee[],
  tolerancePx: number,
  zoom: number,
): Poignee | null {
  const tolerance = tolerancePx / zoom;
  let meilleure: Poignee | null = null;
  let meilleureDist = tolerance;

  for (const p of poignees) {
    const d = dist(curseur, p.point);
    if (d < meilleureDist) {
      meilleureDist = d;
      meilleure = p;
    }
  }

  return meilleure;
}

/**
 * Applique un déplacement de poignée et renvoie la nouvelle géométrie.
 * Renvoie null si la modification est refusée (ex: polygone < 3 sommets).
 */
export function appliquerDeplacementPoignee(
  geom: Geometrie,
  poignee: Poignee,
  nouvPos: Pt,
): Geometrie | null {
  switch (geom.type) {
    case "polyligne":
    case "polygone":
    case "rectangle": {
      if (poignee.type === "sommet") {
        const pts = [...geom.points];
        pts[poignee.index] = nouvPos;
        return { ...geom, points: pts };
      }
      if (poignee.type === "milieu") {
        // Insérer un sommet entre index et index+1
        const pts = [...geom.points];
        pts.splice(poignee.index + 1, 0, nouvPos);
        return { ...geom, points: pts };
      }
      return geom;
    }

    case "cercle": {
      if (poignee.type === "centre") {
        return { ...geom, centre: nouvPos };
      }
      if (poignee.type === "rayon") {
        const rayon = dist(geom.centre, nouvPos);
        return { ...geom, rayon };
      }
      return geom;
    }

    case "arc": {
      if (poignee.type === "centre") {
        return { ...geom, centre: nouvPos };
      }
      // Extrémités et milieu : modifier le rayon
      if (poignee.type === "arc_ext" || poignee.type === "milieu") {
        const rayon = dist(geom.centre, nouvPos);
        const angle = (Math.atan2(nouvPos[1] - geom.centre[1], nouvPos[0] - geom.centre[0]) * 180) / Math.PI;
        if (poignee.type === "arc_ext" && poignee.index === 0) {
          return { ...geom, rayon, angleDebut: (angle + 360) % 360 };
        }
        if (poignee.type === "arc_ext" && poignee.index === 1) {
          return { ...geom, rayon, angleFin: (angle + 360) % 360 };
        }
        return { ...geom, rayon };
      }
      return geom;
    }

    case "point": {
      if (poignee.type === "centre") {
        return { ...geom, position: nouvPos };
      }
      return geom;
    }

    default:
      return geom;
  }
}

/** Supprime un sommet d'une géométrie. Renvoie null si refusé. */
export function supprimerSommet(
  geom: Geometrie,
  index: number,
): Geometrie | null {
  if (geom.type !== "polyligne" && geom.type !== "polygone" && geom.type !== "rectangle") {
    return null;
  }

  const minSommets = geom.type === "polyligne" ? 2 : 3;
  if (geom.points.length <= minSommets) return null;

  const pts = [...geom.points];
  pts.splice(index, 1);
  return { ...geom, points: pts };
}
