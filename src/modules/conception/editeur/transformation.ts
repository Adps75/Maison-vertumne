import type { Pt } from "../geo/plan";
import type { Geometrie } from "../types";

/** Déplace une géométrie par un vecteur [dx, dy]. */
export function deplacerGeometrie(geom: Geometrie, dx: number, dy: number): Geometrie {
  return transformerPoints(geom, ([x, y]) => [x + dx, y + dy]);
}

/** Copie et déplace une géométrie. */
export function copierGeometrie(geom: Geometrie, dx: number, dy: number): Geometrie {
  return deplacerGeometrie(geom, dx, dy);
}

/** Rotation d'une géométrie autour d'un centre, angle en degrés. */
export function rotationGeometrie(geom: Geometrie, centre: Pt, angleDeg: number): Geometrie {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return transformerPoints(geom, ([x, y]) => {
    const dx = x - centre[0];
    const dy = y - centre[1];
    return [centre[0] + dx * cos - dy * sin, centre[1] + dx * sin + dy * cos];
  });
}

/** Miroir d'une géométrie par rapport à un axe défini par deux points. */
export function miroirGeometrie(geom: Geometrie, axeA: Pt, axeB: Pt): Geometrie {
  const dx = axeB[0] - axeA[0];
  const dy = axeB[1] - axeA[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return geom;

  return transformerPoints(geom, ([x, y]) => {
    const px = x - axeA[0];
    const py = y - axeA[1];
    const dot = (px * dx + py * dy) / len2;
    return [axeA[0] + 2 * dot * dx - px, axeA[1] + 2 * dot * dy - py];
  });
}

function transformerPoints(geom: Geometrie, fn: (pt: Pt) => Pt): Geometrie {
  switch (geom.type) {
    case "polyligne":
      return { ...geom, points: geom.points.map(fn) };
    case "polygone":
      return { ...geom, points: geom.points.map(fn) };
    case "rectangle":
      return { ...geom, points: geom.points.map(fn) };
    case "cercle":
      return { ...geom, centre: fn(geom.centre) };
    case "arc":
      return { ...geom, centre: fn(geom.centre) };
    case "point":
      return { ...geom, position: fn(geom.position) };
  }
}
