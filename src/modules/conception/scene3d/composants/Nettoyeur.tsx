"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Nettoyeur : libère les ressources WebGL au démontage du Canvas.
// Les images restent en cache mémoire (via cache-textures + useLoader R3F).
// ---------------------------------------------------------------------------

function disposeMateriau(mat: THREE.Material) {
  for (const val of Object.values(mat)) {
    if (val instanceof THREE.Texture) val.dispose();
  }
  mat.dispose();
}

export function Nettoyeur() {
  const { gl, scene } = useThree();

  useEffect(() => {
    return () => {
      // 1. Dispose de chaque geometry, material et texture de la scène
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) disposeMateriau(mat);
      });

      // 2. Force la perte du contexte WebGL (libère le slot)
      gl.forceContextLoss();
      gl.dispose();
    };
  }, [gl, scene]);

  return null;
}
