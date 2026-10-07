"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface EclairageProps {
  emprise: [number, number, number, number];
}

/** Éclairage simple : ambiant + directionnel avec ombres portées. */
export function Eclairage({ emprise }: EclairageProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  // Calculer le frustum de la shadow camera pour couvrir l'emprise
  const shadowParams = useMemo(() => {
    const largeur = emprise[2] - emprise[0];
    const profondeur = emprise[3] - emprise[1];
    const taille = Math.max(largeur, profondeur) * 0.6;
    const cx = (emprise[0] + emprise[2]) / 2;
    const cy = (emprise[1] + emprise[3]) / 2;

    return {
      left: -taille,
      right: taille,
      top: taille,
      bottom: -taille,
      // Position de la lumière au-dessus du centre de l'emprise
      position: [cx + 30, 60, -cy + 30] as [number, number, number],
      target: [cx, 0, -cy] as [number, number, number],
    };
  }, [emprise]);

  // Mettre à jour la cible de la lumière
  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.target.position.set(
        shadowParams.target[0],
        shadowParams.target[1],
        shadowParams.target[2],
      );
      lightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        ref={lightRef}
        position={shadowParams.position}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={shadowParams.left}
        shadow-camera-right={shadowParams.right}
        shadow-camera-top={shadowParams.top}
        shadow-camera-bottom={shadowParams.bottom}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
    </>
  );
}
