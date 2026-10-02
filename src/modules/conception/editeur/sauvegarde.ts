import { getChangements, viderChangements } from "./reducer";
import type { Element } from "../types";

let timer: ReturnType<typeof setTimeout> | null = null;
let updatedAt: string | null = null;

export type StatutSauvegarde = "sauvegarde" | "en_cours" | "non_sauvegarde" | "erreur";

export function setUpdatedAt(ts: string) {
  updatedAt = ts;
}

export function getUpdatedAt(): string | null {
  return updatedAt;
}

/**
 * Planifie une sauvegarde différentielle 2 secondes après la dernière modification.
 * Renvoie une promesse qui résout avec le nouveau statut.
 */
export function planifierSauvegarde(
  projetId: string,
  onStatut: (statut: StatutSauvegarde) => void,
) {
  if (timer) clearTimeout(timer);

  const changements = getChangements();
  if (changements.upserts.length === 0 && changements.suppressions.length === 0) {
    return;
  }

  onStatut("non_sauvegarde");

  timer = setTimeout(async () => {
    const c = getChangements();
    if (c.upserts.length === 0 && c.suppressions.length === 0) return;

    onStatut("en_cours");

    // Dédupliquer les upserts (garder la dernière version de chaque id)
    const upsertMap = new Map<string, Element>();
    for (const el of c.upserts) upsertMap.set(el.id, el);

    // Retirer des suppressions les éléments qui sont aussi dans les upserts
    const suppressions = c.suppressions.filter((id) => !upsertMap.has(id));

    try {
      const res = await fetch(`/api/conception/projets/${projetId}/elements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upserts: Array.from(upsertMap.values()),
          suppressions,
          updated_at: updatedAt,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        onStatut("erreur");
        console.warn("[sauvegarde] Conflit : le projet a été modifié ailleurs.");
        return;
      }

      if (!data.ok) {
        onStatut("erreur");
        return;
      }

      updatedAt = data.updated_at;
      viderChangements();
      onStatut("sauvegarde");
    } catch {
      onStatut("erreur");
    }
  }, 2000);
}
