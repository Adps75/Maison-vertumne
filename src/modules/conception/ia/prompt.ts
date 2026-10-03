import { STYLE_PLANTE } from "../config/style-plantes";

interface FichePlante {
  nom_latin: string;
  forme?: string | null;
  couleur_feuillage?: string | null;
  couleur_floraison?: string | null;
  periode_floraison?: string | null;
  feuillage?: string | null;
  hauteur_adulte_m?: number | null;
  largeur_adulte_m?: number | null;
  floraison_visible?: boolean | null;
}

/** Construit le prompt pour la vue de face. Pas de mention du fond. */
export function promptFace(plante: FichePlante, avecReference: boolean): string {
  const parties = [STYLE_PLANTE.base, STYLE_PLANTE.face];

  parties.push(`Species: ${plante.nom_latin}.`);

  if (plante.forme === "boule") {
    parties.push(STYLE_PLANTE.formeBoule);
  } else if (plante.forme) {
    parties.push(`Growth habit: ${plante.forme}.`);
  }

  if (plante.feuillage) parties.push(`Foliage: ${plante.feuillage}.`);
  if (plante.couleur_feuillage) parties.push(`Leaf color: ${plante.couleur_feuillage}.`);

  if (plante.floraison_visible && plante.couleur_floraison) {
    if (plante.periode_floraison) {
      parties.push(`Flowers: ${plante.couleur_floraison}, blooming in ${plante.periode_floraison}.`);
    } else {
      parties.push(`Flowers: ${plante.couleur_floraison}.`);
    }
  } else if (!plante.floraison_visible) {
    parties.push("Show the plant without flowers (flowering is discreet or not in season).");
  }

  if (plante.hauteur_adulte_m) {
    parties.push(`Mature height: approximately ${plante.hauteur_adulte_m} m.`);
  }

  if (avecReference) parties.push(STYLE_PLANTE.referenceInstruction);

  return parties.join(" ");
}

/** Construit le prompt pour la vue de dessus. Pas de mention du fond. */
export function promptDessus(plante: FichePlante, avecReference: boolean): string {
  const parties = [STYLE_PLANTE.base, STYLE_PLANTE.dessus];

  parties.push(`Species: ${plante.nom_latin}.`);

  if (plante.forme === "boule") {
    parties.push("Canopy is a regular sphere seen from directly above, appearing as a perfect circle of dense foliage.");
  } else if (plante.forme) {
    parties.push(`Canopy shape: ${plante.forme}.`);
  }

  if (plante.couleur_feuillage) parties.push(`Foliage color: ${plante.couleur_feuillage}.`);
  if (plante.largeur_adulte_m) {
    parties.push(`Canopy spread: approximately ${plante.largeur_adulte_m} m.`);
  }

  if (avecReference) parties.push(STYLE_PLANTE.referenceInstruction);

  return parties.join(" ");
}
