import type { NomOutil } from "../types";
import type { Pt } from "../geo/plan";

/** Table des commandes textuelles. */
export const COMMANDES: Record<string, NomOutil> = {
  PL: "polyligne",
  REC: "rectangle",
  C: "cercle",
  A: "arc",
  DI: "cote",
  T: "texte",
  M: "deplacer",
  CO: "copier",
  RO: "rotation",
  MI: "miroir",
};

/**
 * Parse une saisie de longueur, avec option d'angle : "4.5" ou "4.5<30".
 * Renvoie le point résultant depuis une base dans la direction du curseur,
 * ou dans l'angle spécifié.
 */
export function parseSaisie(
  saisie: string,
  base: Pt,
  curseur: Pt,
): { point: Pt; type: "longueur" | "commande" | "fermer" } | null {
  const s = saisie.trim().toUpperCase();

  // Fermer la polyligne
  if (s === "C") {
    return { point: base, type: "fermer" };
  }

  // Commande
  if (COMMANDES[s]) {
    return { point: base, type: "commande" };
  }

  // Longueur + angle : "4.5<30"
  const matchAngle = s.match(/^([\d.]+)<([\d.]+)$/);
  if (matchAngle) {
    const longueur = parseFloat(matchAngle[1]);
    const angle = parseFloat(matchAngle[2]);
    if (isNaN(longueur) || isNaN(angle)) return null;

    const rad = (angle * Math.PI) / 180;
    return {
      point: [base[0] + longueur * Math.cos(rad), base[1] + longueur * Math.sin(rad)],
      type: "longueur",
    };
  }

  // Longueur seule : direction du curseur
  const longueur = parseFloat(s);
  if (isNaN(longueur)) return null;

  const dx = curseur[0] - base[0];
  const dy = curseur[1] - base[1];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return null;

  return {
    point: [base[0] + (dx / d) * longueur, base[1] + (dy / d) * longueur],
    type: "longueur",
  };
}
