"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Vegetal3D } from "../types";
import { planVers3D } from "../conversion";
import { garderImageEnCache } from "../cache-textures";

interface VegetauxProps {
  vegetaux: Vegetal3D[];
}

/** Végétaux en billboards (image de face, rotation verticale vers la caméra). */
export function Vegetaux({ vegetaux }: VegetauxProps) {
  return (
    <>
      {vegetaux.map((v) => (
        <Suspense key={v.id} fallback={null}>
          <VegetalBillboard vegetal={v} />
        </Suspense>
      ))}
    </>
  );
}

function VegetalBillboard({ vegetal }: { vegetal: Vegetal3D }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, vegetal.imageUrl);

  // Garder l'image en cache mémoire pour éviter un retéléchargement
  useEffect(() => {
    if (texture.image instanceof HTMLImageElement) {
      garderImageEnCache(vegetal.imageUrl, texture.image);
    }
  }, [texture, vegetal.imageUrl]);

  // Calculer la largeur depuis le ratio de l'image chargée
  const largeur = useMemo(() => {
    if (!texture.image) return vegetal.hauteur_m;
    const ratio = texture.image.width / texture.image.height;
    return vegetal.hauteur_m * ratio;
  }, [texture, vegetal.hauteur_m]);

  // Position : base au sol, centré verticalement
  const position = useMemo(() => {
    const [x, , z] = planVers3D(vegetal.position[0], vegetal.position[1]);
    return new THREE.Vector3(x, vegetal.hauteur_m / 2, z);
  }, [vegetal.position, vegetal.hauteur_m]);

  // Rotation verticale uniquement (axe Y) vers la caméra
  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    const dir = new THREE.Vector3();
    dir.subVectors(camera.position, meshRef.current.position);
    meshRef.current.rotation.y = Math.atan2(dir.x, dir.z);
  });

  return (
    <mesh ref={meshRef} position={position} castShadow>
      <planeGeometry args={[largeur, vegetal.hauteur_m]} />
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
