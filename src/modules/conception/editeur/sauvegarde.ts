import { getChangements, retirerChangementsEnvoyes } from "./reducer";
import type { Element } from "../types";

/**
 * Sauvegarde différentielle des éléments : envoi 2 s après la dernière modification, ou
 * immédiatement à la fermeture / au masquage de l'onglet et quand on quitte le projet
 * (fetch keepalive, qui survit au déchargement de la page).
 */

let timer: ReturnType<typeof setTimeout> | null = null;
let updatedAt: string | null = null;
let projetCourant: string | null = null;
let rappelStatut: ((statut: StatutSauvegarde) => void) | null = null;
/** Envoi en cours : un nouvel envoi attend sa fin (sinon sa date de référence serait périmée). */
let enCours: Promise<void> | null = null;

export type StatutSauvegarde = "sauvegarde" | "en_cours" | "non_sauvegarde" | "erreur" | "conflit";

/** Taille maximale d'un corps envoyé avec keepalive (limite des navigateurs : 64 Ko). */
const LIMITE_KEEPALIVE = 60_000;

export function setUpdatedAt(ts: string) {
  updatedAt = ts;
}

export function getUpdatedAt(): string | null {
  return updatedAt;
}

/** Reste-t-il des modifications non enregistrées ? */
export function aDesModificationsNonEnregistrees(): boolean {
  const c = getChangements();
  return c.upserts.length > 0 || c.suppressions.length > 0;
}

/** Corps de la requête : dernière version de chaque élément, suppressions sans les ré-ajouts. */
export function corpsSauvegarde(upserts: Element[], suppressionsBrutes: string[], reference: string | null) {
  const upsertMap = new Map<string, Element>();
  for (const el of upserts) upsertMap.set(el.id, el);
  const suppressions = [...new Set(suppressionsBrutes)].filter((id) => !upsertMap.has(id));
  return { upserts: Array.from(upsertMap.values()), suppressions, updated_at: reference };
}

function envoyer(projetId: string, onStatut: (s: StatutSauvegarde) => void, keepalive: boolean): Promise<void> {
  // Fermeture de la page : envoi immédiat, sans attendre (la page ne survivrait pas à l'attente)
  if (enCours && !keepalive) return enCours.then(() => envoyer(projetId, onStatut, keepalive));
  const p = envoyerMaintenant(projetId, onStatut, keepalive).finally(() => { if (enCours === p) enCours = null; });
  enCours = p;
  return p;
}

async function envoyerMaintenant(projetId: string, onStatut: (s: StatutSauvegarde) => void, keepalive: boolean) {
  const c = getChangements();
  const nbUpserts = c.upserts.length, nbSuppressions = c.suppressions.length;
  if (nbUpserts === 0 && nbSuppressions === 0) return;
  const corps = JSON.stringify(corpsSauvegarde(c.upserts, c.suppressions, updatedAt));
  onStatut("en_cours");
  try {
    const res = await fetch(`/api/conception/projets/${projetId}/elements`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: corps,
      // keepalive : la requête part même si la page se ferme (corps limité à 64 Ko)
      keepalive: keepalive && corps.length < LIMITE_KEEPALIVE,
    });
    const data = await res.json();
    if (res.status === 409) {
      // Vrai conflit : le projet a été modifié dans un autre onglet
      onStatut("conflit");
      console.warn("[sauvegarde] Conflit : le projet a été modifié ailleurs.");
      return;
    }
    if (!data.ok) {
      onStatut("erreur");
      return;
    }
    updatedAt = data.updated_at;
    // Seuls les changements envoyés sont retirés : ceux faits pendant l'envoi restent en attente
    retirerChangementsEnvoyes(nbUpserts, nbSuppressions);
    onStatut(aDesModificationsNonEnregistrees() ? "non_sauvegarde" : "sauvegarde");
    if (aDesModificationsNonEnregistrees()) planifierSauvegarde(projetId, onStatut);
  } catch {
    onStatut("erreur");
  }
}

/** Planifie une sauvegarde différentielle 2 secondes après la dernière modification. */
export function planifierSauvegarde(projetId: string, onStatut: (statut: StatutSauvegarde) => void) {
  projetCourant = projetId;
  rappelStatut = onStatut;
  if (timer) clearTimeout(timer);
  if (!aDesModificationsNonEnregistrees()) return;
  onStatut("non_sauvegarde");
  timer = setTimeout(() => {
    timer = null;
    void envoyer(projetId, onStatut, false);
  }, 2000);
}

/**
 * Envoie tout de suite l'enregistrement en attente (fermeture ou masquage de l'onglet,
 * sortie du projet). Sans effet s'il n'y a rien à enregistrer.
 */
export function envoyerImmediatement(keepalive = true): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!projetCourant || !rappelStatut || !aDesModificationsNonEnregistrees()) return Promise.resolve();
  return envoyer(projetCourant, rappelStatut, keepalive);
}
