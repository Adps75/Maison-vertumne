/**
 * Estimation du coût d'un rendu IA, affichée avant la génération — fonction pure.
 *
 * Base : tableau de coût par image de la documentation OpenAI pour GPT Image 2
 * (qualité « high » : 0,211 $ pour 1024×1024), proportionnel au nombre de pixels,
 * majoré de 15 % pour l'image d'entrée et la consigne. Les modèles 2.5 ont les mêmes
 * tarifs par jeton. C'est une estimation : le coût réel est calculé après coup à
 * partir de la consommation renvoyée par l'API (calculerCout).
 */

const USD_PAR_IMAGE_1024_HIGH = 0.211;
const MAJORATION_ENTREE = 1.15;
const USD_VERS_EUR = 0.92;

/** Coût estimé en euros d'une édition à la taille donnée (qualité haute). */
export function estimerCoutEdition(largeur: number, hauteur: number): number {
  const pixels = largeur * hauteur;
  const usd = USD_PAR_IMAGE_1024_HIGH * (pixels / (1024 * 1024)) * MAJORATION_ENTREE;
  return Math.round(usd * USD_VERS_EUR * 100) / 100;
}

/** Format « 0,32 € ». */
export function formaterEuros(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}
