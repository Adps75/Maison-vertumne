"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { draperLigne, type TraitPlan } from "../traits-construction";

const LARGEUR_TRAIT_PX = 2;
const LARGEUR_LISERE_PX = 4;
/**
 * Liseré opaque : un liseré transparent serait dessiné après le trait (Three.js
 * rend les objets transparents en dernier) et s'assombrirait à chaque sommet.
 */
const COULEUR_LISERE = "#1c1a17";

/**
 * Traits de construction posés sur le relief (2 cm au-dessus), en traits de
 * 2 px à la couleur du calque, sur un liseré sombre pour la lisibilité.
 * Purement visuels : aucun lancer de rayon ne les vise.
 */
export function TraitsConstruction({
  traits,
  altitudeEn,
}: {
  traits: TraitPlan[];
  altitudeEn: (x: number, y: number) => number;
}) {
  const lignes = useMemo(
    () => traits
      .map((t) => ({ id: t.id, couleur: t.couleur, points: draperLigne(t.points, t.ferme, altitudeEn) }))
      .filter((l) => l.points.length >= 2),
    [traits, altitudeEn],
  );

  return (
    <group name="traits-construction">
      {lignes.map((l) => (
        <group key={l.id}>
          <Line
            points={l.points}
            color={COULEUR_LISERE}
            lineWidth={LARGEUR_LISERE_PX}
            depthWrite={false}
            renderOrder={1}
            raycast={() => null}
          />
          <Line
            points={l.points}
            color={l.couleur}
            lineWidth={LARGEUR_TRAIT_PX}
            depthWrite={false}
            renderOrder={2}
            raycast={() => null}
          />
        </group>
      ))}
    </group>
  );
}
