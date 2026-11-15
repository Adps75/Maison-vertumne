/**
 * Application d'une composition au plan — fonctions pures.
 * Intention + plantes → plantes à placer → éléments « vegetal » du plan.
 */

import type { Element } from "../types";
import { rayonEcartement } from "../vegetaux/ecartement";
import { groupeImpair, ROLES_NOMBRE_FIXE, type PlanteAPlacer, type Placement } from "./placement";
import type { Brief, Intention } from "./schemas";

/** Plante de la palette validée (données de la bibliothèque). */
export interface PlanteComposee {
  id: string;
  nom_commun: string;
  nom_latin: string;
  categorie: string;
  forme: string | null;
  hauteur_adulte_m: number | null;
  largeur_adulte_m: number | null;
  largeur_3ans_m?: number | null;
  updated_at?: string;
}

/**
 * Plantes à placer : nombre fixe pour la structure et la ponctuation (au moins 1),
 * part de surface (0–1) pour les autres rôles. Les quantités sont calculées au placement.
 */
export function plantesAPlacer(intention: Intention, plantes: PlanteComposee[]): PlanteAPlacer[] {
  const parId = new Map(plantes.map((p) => [p.id, p]));
  const sortie: PlanteAPlacer[] = [];
  for (const i of intention.plantes) {
    const p = parId.get(i.plante_id);
    if (!p) continue;
    const fixe = ROLES_NOMBRE_FIXE.includes(i.role);
    sortie.push({
      cle: p.id,
      rayon: rayonEcartement({ largeur_3ans_m: p.largeur_3ans_m ?? undefined, diametre_m: p.largeur_adulte_m ?? 1 }),
      hauteur: p.hauteur_adulte_m ?? 0.5,
      categorie: p.categorie,
      forme: p.forme,
      role: i.role,
      profondeur: i.profondeur,
      nombre: fixe ? Math.max(1, Math.round(i.nombre ?? 1)) : null,
      part: fixe ? 0 : Math.max(0, i.part_surface ?? 0) / 100,
      tailleGroupe: groupeImpair(i.taille_groupe),
      repetitions: Math.max(1, Math.round(i.repetitions)),
    });
  }
  return sortie;
}

/** Plantes de la palette qui n'existent plus dans la bibliothèque. */
export function plantesAbsentes(palette: Pick<PlanteComposee, "id" | "nom_commun">[], presentes: string[]): Pick<PlanteComposee, "id" | "nom_commun">[] {
  const ids = new Set(presentes);
  return palette.filter((p) => !ids.has(p.id));
}

/** Message affiché quand la palette contient des plantes supprimées de la bibliothèque. */
export function messagePlantesAbsentes(absentes: Pick<PlanteComposee, "nom_commun">[]): string {
  const noms = absentes.map((p) => p.nom_commun).join(", ");
  return absentes.length === 1
    ? `${noms} n'existe plus dans la bibliothèque : relancez la composition avec une palette à jour.`
    : `${noms} n'existent plus dans la bibliothèque : relancez la composition avec une palette à jour.`;
}

/** Tolérance de chevauchement ajustée à la densité demandée (bornée à [0 ; 0,4]). */
export function toleranceDensite(base: number, densite: Brief["densite"]): number {
  const t = densite === "serree" ? base + 0.1 : densite === "aeree" ? base - 0.1 : base;
  return Math.max(0, Math.min(0.4, Math.round(t * 100) / 100));
}

/** Éléments du plan pour les placements calculés. */
export function elementsComposition(params: {
  placements: Placement[];
  plantes: PlanteComposee[];
  compositionId: string;
  contourId: string;
  ordreBase: number;
  genererId: () => string;
}): Element[] {
  const parId = new Map(params.plantes.map((p) => [p.id, p]));
  return params.placements.map((pl, i) => {
    const p = parId.get(pl.cle)!;
    return {
      id: params.genererId(),
      type: "vegetal",
      geometrie: { type: "point", position: pl.position },
      calque: "vegetal",
      statut: "nouveau",
      hauteur: p.hauteur_adulte_m ?? 0.5,
      proprietes: {
        plante_id: p.id,
        nom_commun: p.nom_commun,
        nom_latin: p.nom_latin,
        diametre_m: p.largeur_adulte_m ?? 1,
        largeur_3ans_m: p.largeur_3ans_m ?? null,
        hauteur_m: p.hauteur_adulte_m ?? 0.5,
        version: p.updated_at ?? "",
        categorie: p.categorie,
        forme: p.forme,
        rotation: 0,
        composition_id: params.compositionId,
        composition_contour: params.contourId,
      },
      ordre: params.ordreBase + i,
    } satisfies Element;
  });
}

/** Identifiants des plantes d'une composition IA déjà posée dans ce contour. */
export function plantesCompositionExistante(elements: Iterable<Element>, contourId: string): string[] {
  const ids: string[] = [];
  for (const el of elements) {
    if (el.type === "vegetal" && el.proprietes.composition_contour === contourId && el.proprietes.composition_id) ids.push(el.id);
  }
  return ids;
}
