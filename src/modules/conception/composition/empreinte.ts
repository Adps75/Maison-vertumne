/**
 * Empreinte des données d'entrée de l'analyse : l'analyse enregistrée n'est
 * réutilisée que si le contour du massif, les vues calées utilisées et l'existant
 * du plan autour du massif n'ont pas changé. Fonction pure.
 */

import type { Pt } from "../geo/plan";
import type { CameraParams } from "../camera/types";

export interface DonneesEmpreinte {
  contour: Pt[];
  vues: { id: string; camera: CameraParams }[];
  /** Végétaux du plan autour du massif, hors ceux ajoutés depuis une analyse. */
  existant: { id: string; position: Pt; diametre: number }[];
}

const r = (v: number) => Math.round(v * 100) / 100;

/** Hachage FNV-1a 64 bits (deux moitiés de 32 bits), en hexadécimal. */
function fnv1a(texte: string): string {
  let h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    h2 = (h2 + (h1 >>> 7)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function empreinteAnalyse(d: DonneesEmpreinte): string {
  const canonique = JSON.stringify({
    contour: d.contour.map(([x, y]) => [r(x), r(y)]),
    vues: [...d.vues].sort((a, b) => a.id.localeCompare(b.id)).map((v) => ({
      id: v.id, x: r(v.camera.x), y: r(v.camera.y), h: r(v.camera.hauteur), cap: r(v.camera.cap),
      inc: r(v.camera.inclinaison), roulis: r(v.camera.roulis), fov: r(v.camera.fov_v),
    })),
    existant: [...d.existant].sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ id: e.id, p: [r(e.position[0]), r(e.position[1])], d: r(e.diametre) })),
  });
  return fnv1a(canonique);
}
