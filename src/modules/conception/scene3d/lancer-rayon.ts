/**
 * Lancer de rayon sur le relief — fonction pure, sans dépendance à Three.js.
 *
 * Le rayon est exprimé en coordonnées Three.js (X = est, Y = hauteur, Z = -nord).
 * La surface visée est exactement celle sur laquelle les plantes sont posées :
 * le point (x, y, altitudeEn(x, y)). Le pied d'une plante posée au point trouvé
 * est donc sur le rayon, c'est-à-dire exactement sous le curseur.
 *
 * Méthode : marche le long du rayon par pas fixes jusqu'au premier passage
 * sous le terrain, puis dichotomie entre les deux derniers pas.
 */

export type Vec3 = [number, number, number];

/** Pas de la marche le long du rayon, en mètres. */
const PAS_MARCHE = 0.25;
/** Nombre d'itérations de dichotomie (précision ≈ PAS / 2^40). */
const ITERATIONS_DICHOTOMIE = 40;
/** Garde-fou sur le nombre de pas. */
const PAS_MAX = 20_000;

/**
 * Intersecte un rayon avec le terrain.
 *
 * @param origine   origine du rayon (Three.js)
 * @param direction direction du rayon (Three.js), normalisée ou non
 * @param altitudeEn altitude du terrain en un point plan (x est, y nord)
 * @param emprise   [xMin, yMin, xMax, yMax] en coordonnées plan ; la recherche
 *                  est limitée à cette emprise élargie de sa plus grande dimension
 *                  de chaque côté
 * @returns [x, y, altitude] en coordonnées plan, ou null si le rayon ne touche
 *          pas le terrain dans la zone de recherche
 */
export function intersecterTerrain(
  origine: Vec3,
  direction: Vec3,
  altitudeEn: (x: number, y: number) => number,
  emprise: [number, number, number, number],
): [number, number, number] | null {
  const norme = Math.hypot(direction[0], direction[1], direction[2]);
  if (!(norme > 0)) return null;
  const d: Vec3 = [direction[0] / norme, direction[1] / norme, direction[2] / norme];

  // Boîte de recherche en plan, convertie en Three.js (Z = -y)
  const marge = Math.max(emprise[2] - emprise[0], emprise[3] - emprise[1], 1);
  const xMin = emprise[0] - marge;
  const xMax = emprise[2] + marge;
  const zMin = -(emprise[3] + marge);
  const zMax = -(emprise[1] - marge);

  const bornes = intervalleDansBoite(origine[0], d[0], xMin, xMax, origine[2], d[2], zMin, zMax);
  if (!bornes) return null;
  const [tEntree, tSortie] = bornes;

  // f(t) > 0 : le rayon est au-dessus du terrain
  const f = (t: number): number => {
    const x = origine[0] + t * d[0];
    const h = origine[1] + t * d[1];
    const y = -(origine[2] + t * d[2]);
    return h - altitudeEn(x, y);
  };

  let t0 = tEntree;
  // Origine (ou entrée dans la zone) déjà sous le terrain : pas d'intersection exploitable
  if (!(f(t0) > 0)) return null;

  const nbPas = Math.min(Math.ceil((tSortie - tEntree) / PAS_MARCHE), PAS_MAX);
  const pas = nbPas > 0 ? (tSortie - tEntree) / nbPas : 0;

  for (let i = 1; i <= nbPas; i++) {
    const t1 = tEntree + i * pas;
    const f1 = f(t1);
    if (f1 <= 0) {
      // Passage sous le terrain entre t0 et t1 : dichotomie
      let a = t0;
      let b = t1;
      for (let k = 0; k < ITERATIONS_DICHOTOMIE; k++) {
        const m = (a + b) / 2;
        if (f(m) > 0) a = m;
        else b = m;
      }
      const t = (a + b) / 2;
      const x = origine[0] + t * d[0];
      const y = -(origine[2] + t * d[2]);
      return [x, y, altitudeEn(x, y)];
    }
    t0 = t1;
  }
  return null;
}

/**
 * Intervalle [tEntree, tSortie] (t ≥ 0) du rayon dans la boîte verticale
 * [xMin, xMax] × [zMin, zMax] (méthode des dalles). null si le rayon n'y passe pas.
 */
function intervalleDansBoite(
  ox: number, dx: number, xMin: number, xMax: number,
  oz: number, dz: number, zMin: number, zMax: number,
): [number, number] | null {
  let tMin = 0;
  let tMax = Infinity;

  for (const [o, dir, min, max] of [[ox, dx, xMin, xMax], [oz, dz, zMin, zMax]] as const) {
    if (Math.abs(dir) < 1e-12) {
      if (o < min || o > max) return null;
      continue;
    }
    let ta = (min - o) / dir;
    let tb = (max - o) / dir;
    if (ta > tb) [ta, tb] = [tb, ta];
    tMin = Math.max(tMin, ta);
    tMax = Math.min(tMax, tb);
    if (tMin > tMax) return null;
  }

  // Rayon vertical (aucune composante horizontale) : borner par la hauteur
  if (!Number.isFinite(tMax)) tMax = tMin + 10_000;
  return [tMin, tMax];
}
