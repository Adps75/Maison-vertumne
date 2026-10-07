"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Batiment3D } from "../types";
import type { Pt } from "../../geo/plan";

const HAUTEUR_DEFAUT = 6; // mètres, bâtiment courant français
const COULEUR_BATIMENT = "#D0C8B8";

interface BatimentProps {
  batiments: Batiment3D[];
}

/** Bâtiments extrudés à leur hauteur BD TOPO. */
export function Batiments({ batiments }: BatimentProps) {
  return (
    <>
      {batiments.map((bat, i) => (
        <BatimentMesh key={bat.cleabs || i} batiment={bat} />
      ))}
    </>
  );
}

function BatimentMesh({ batiment }: { batiment: Batiment3D }) {
  const hauteur = batiment.hauteur ?? HAUTEUR_DEFAUT;
  const polygones = useMemo(() => extrairePolygones(batiment), [batiment]);

  return (
    <>
      {polygones.map((rings, i) => (
        <PolygoneExtrude key={i} rings={rings} hauteur={hauteur} />
      ))}
    </>
  );
}

function PolygoneExtrude({
  rings,
  hauteur,
}: {
  rings: Pt[][];
  hauteur: number;
}) {
  const geometry = useMemo(() => {
    const outer = rings[0];
    if (!outer || outer.length < 3) return null;

    // Créer la shape dans le plan XY (x plan, y plan)
    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) {
      shape.lineTo(outer[i][0], outer[i][1]);
    }
    shape.closePath();

    // Ajouter les trous (rings intérieurs)
    for (let h = 1; h < rings.length; h++) {
      const hole = rings[h];
      if (hole.length < 3) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) {
        holePath.lineTo(hole[i][0], hole[i][1]);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }

    return new THREE.ExtrudeGeometry(shape, {
      depth: hauteur,
      bevelEnabled: false,
    });
  }, [rings, hauteur]);

  if (!geometry) return null;

  // ExtrudeGeometry crée la shape dans XY et extrude le long de Z.
  // On tourne de -π/2 autour de X pour que l'extrusion aille vers le haut (Y).
  // Le plan XY de la shape correspond alors au plan XZ de la scène.
  // La convention plan est (x=est, y=nord). En Three.js on veut (x=est, z=-nord).
  // Après rotation -π/2 sur X : x reste, y_shape → -z, z_extrude → y.
  // Donc y_shape = y_plan donne z_three = -y_plan = -nord ✓, et l'extrusion monte ✓.
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={COULEUR_BATIMENT} />
    </mesh>
  );
}

/** Extrait les polygones d'un bâtiment (gère Polygon et MultiPolygon). */
function extrairePolygones(bat: Batiment3D): Pt[][][] {
  const geom = bat.geometry;

  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as number[][][][]).map((poly) =>
      poly.map((ring) => ring.map(([x, y]) => [x, y] as Pt)),
    );
  }

  // Polygon : un seul polygone avec N rings
  return [
    (geom.coordinates as number[][][]).map((ring) =>
      ring.map(([x, y]) => [x, y] as Pt),
    ),
  ];
}
