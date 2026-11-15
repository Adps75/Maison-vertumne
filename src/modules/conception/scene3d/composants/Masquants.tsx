"use client";

/**
 * Volumes masquants des végétaux existants : écriture de profondeur seule, sans couleur
 * ni ombre portée (l'ombre réelle est déjà sur la photo). Dessinés avant les végétaux du
 * projet, ils cachent ceux qui sont derrière eux ; ceux de devant restent visibles.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { Masquant3D } from "../types";
import { primitivesMasquant, type Primitive } from "../masquants";

const pasDeRaycast = () => null;

function Volume({ p }: { p: Primitive }) {
  const geometrie = useMemo(() => {
    switch (p.type) {
      case "cone": return new THREE.ConeGeometry(p.rayon, p.hauteur, 32, 1);
      case "cylindre": return new THREE.CylinderGeometry(p.rayon, p.rayon, p.hauteur, 24, 1);
      case "ellipsoide": return new THREE.SphereGeometry(1, 32, 16);
      case "pave": return new THREE.BoxGeometry(p.dimensions[0], p.dimensions[1], p.dimensions[2]);
    }
  }, [p]);
  const echelle: [number, number, number] = p.type === "ellipsoide" ? p.rayons : [1, 1, 1];
  const rotation: [number, number, number] = p.type === "pave" ? [0, p.rotationY, 0] : [0, 0, 0];
  return (
    <mesh geometry={geometrie} position={p.centre} scale={echelle} rotation={rotation} renderOrder={-1}
      raycast={pasDeRaycast} userData={{ masquant: true }}>
      <meshBasicMaterial colorWrite={false} depthWrite={true} />
    </mesh>
  );
}

export function Masquants({ masquants }: { masquants: Masquant3D[] }) {
  const primitives = useMemo(() => masquants.flatMap((m) => primitivesMasquant(m).map((p, i) => ({ cle: `${m.id}-${i}`, p }))), [masquants]);
  return <>{primitives.map(({ cle, p }) => <Volume key={cle} p={p} />)}</>;
}
