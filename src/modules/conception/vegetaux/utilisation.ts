/**
 * Utilisation d'une plante de la bibliothèque dans les projets — fonctions pures.
 * Une plante posée sur un plan, ou présente dans la palette ou l'intention d'une
 * composition, ne peut pas être supprimée.
 */

export interface ProjetUtilisateur {
  id: string;
  nom: string;
}

export function projetsUtilisantPlante(planteId: string, d: {
  /** Éléments du plan qui référencent la plante (déjà filtrés par plante_id). */
  elements: { projet_id: string }[];
  /** Compositions (palette et intention en JSON). */
  compositions: { projet_id: string; palette: unknown; intention: unknown }[];
  projets: { id: string; nom: string | null }[];
}): ProjetUtilisateur[] {
  const ids = new Set(d.elements.map((e) => e.projet_id));
  for (const c of d.compositions) {
    if (JSON.stringify(c.palette ?? null).includes(planteId) || JSON.stringify(c.intention ?? null).includes(planteId)) ids.add(c.projet_id);
  }
  const noms = new Map(d.projets.map((p) => [p.id, p.nom]));
  return [...ids]
    .map((id) => ({ id, nom: noms.get(id) || "Projet sans nom" }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Message de refus, avec les projets concernés. */
export function messagePlanteUtilisee(projets: ProjetUtilisateur[]): string {
  const liste = projets.map((p) => `« ${p.nom} »`).join(", ");
  return projets.length === 1
    ? `Cette plante est utilisée dans le projet ${liste}. Retirez-la de ce projet avant de la supprimer.`
    : `Cette plante est utilisée dans ${projets.length} projets : ${liste}. Retirez-la de ces projets avant de la supprimer.`;
}
