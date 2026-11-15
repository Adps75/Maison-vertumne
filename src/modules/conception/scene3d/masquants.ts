/**
 * Volumes masquants des végétaux existants — fonctions pures.
 *
 * Un végétal existant est déjà sur la photo : il n'est jamais dessiné, mais son volume
 * (écriture de profondeur seule) cache les plantes du projet situées derrière lui.
 * Coordonnées 3D : x = x plan, y = altitude, z = -y plan (voir conversion.ts).
 */

import type { Masquant3D } from "./types";

export type Primitive =
  | { type: "cone"; centre: [number, number, number]; rayon: number; hauteur: number }
  | { type: "cylindre"; centre: [number, number, number]; rayon: number; hauteur: number }
  | { type: "ellipsoide"; centre: [number, number, number]; rayons: [number, number, number] }
  | { type: "pave"; centre: [number, number, number]; dimensions: [number, number, number]; rotationY: number };

/** Primitives d'un volume masquant, posées sur le sol à l'altitude du pied. */
export function primitivesMasquant(m: Masquant3D): Primitive[] {
  const [x, yPlan] = m.position;
  const z = -yPlan || 0;
  const base = m.altitudeRelative;
  const h = Math.max(0.05, m.hauteur_m);
  const r = Math.max(0.05, m.diametre_m / 2);
  switch (m.forme) {
    case "cone":
      return [{ type: "cone", centre: [x, base + h / 2, z], rayon: r, hauteur: h }];
    case "colonne":
      return [{ type: "cylindre", centre: [x, base + h / 2, z], rayon: r, hauteur: h }];
    case "boule":
      return [{ type: "ellipsoide", centre: [x, base + h / 2, z], rayons: [r, h / 2, r] }];
    case "haie":
      // Longueur selon l'orientation (depuis l'est, sens trigonométrique), épaisseur = diamètre
      return [{ type: "pave", centre: [x, base + h / 2, z], dimensions: [Math.max(0.1, m.longueur_m), h, 2 * r], rotationY: (m.orientation_deg * Math.PI) / 180 }];
    case "arbre": {
      // Tronc sous la couronne ; couronne sur les 65 % supérieurs de la hauteur
      const hCouronne = h * 0.65;
      const hTronc = h - hCouronne;
      const rTronc = Math.min(r * 0.5, Math.max(0.08, r * 0.08));
      return [
        { type: "cylindre", centre: [x, base + hTronc / 2 + 0.05, z], rayon: rTronc, hauteur: hTronc + 0.1 },
        { type: "ellipsoide", centre: [x, base + hTronc + hCouronne / 2, z], rayons: [r, hCouronne / 2, r] },
      ];
    }
  }
}

/** Le point 3D est-il à l'intérieur d'une primitive (tests et diagnostics) ? */
export function dansPrimitive(p: [number, number, number], q: Primitive): boolean {
  const [dx, dy, dz] = [p[0] - q.centre[0], p[1] - q.centre[1], p[2] - q.centre[2]];
  switch (q.type) {
    case "cone": {
      if (Math.abs(dy) > q.hauteur / 2) return false;
      const rayonIci = q.rayon * (0.5 - dy / q.hauteur); // large en bas, pointe en haut
      return Math.hypot(dx, dz) <= rayonIci;
    }
    case "cylindre":
      return Math.abs(dy) <= q.hauteur / 2 && Math.hypot(dx, dz) <= q.rayon;
    case "ellipsoide":
      return (dx / q.rayons[0]) ** 2 + (dy / q.rayons[1]) ** 2 + (dz / q.rayons[2]) ** 2 <= 1;
    case "pave": {
      // Repère local : rotation inverse autour de Y
      const c = Math.cos(-q.rotationY), s = Math.sin(-q.rotationY);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      return Math.abs(lx) <= q.dimensions[0] / 2 && Math.abs(dy) <= q.dimensions[1] / 2 && Math.abs(lz) <= q.dimensions[2] / 2;
    }
  }
}

/**
 * Une plante du projet est-elle cachée par le volume, vue depuis la caméra ? Le segment
 * caméra → point visé de la plante traverse-t-il le volume avant d'atteindre la plante ?
 */
export function segmentTraverse(camera: [number, number, number], cible: [number, number, number], prims: Primitive[], pas = 0.02): boolean {
  const d = Math.hypot(cible[0] - camera[0], cible[1] - camera[1], cible[2] - camera[2]);
  const n = Math.ceil(d / pas);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p: [number, number, number] = [camera[0] + (cible[0] - camera[0]) * t, camera[1] + (cible[1] - camera[1]) * t, camera[2] + (cible[2] - camera[2]) * t];
    if (prims.some((q) => dansPrimitive(p, q))) return true;
  }
  return false;
}
