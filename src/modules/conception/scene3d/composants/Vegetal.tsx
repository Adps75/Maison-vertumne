"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Vegetal3D } from "../types";
import { planVers3D } from "../conversion";
import { garderImageEnCache } from "../cache-textures";

interface VegetauxProps {
  vegetaux: Vegetal3D[];
  /** IDs des végétaux sélectionnés. */
  selection?: Set<string>;
  /** Ref de la position de drag en cours (lu chaque frame). */
  dragPositionRef?: React.RefObject<[number, number] | null>;
  /** ID de l'élément en cours de drag. */
  dragElementIdRef?: React.RefObject<string | null>;
  /** Fonction altitude. */
  altitudeEn?: ((x: number, y: number) => number) | null;
}

export function Vegetaux({
  vegetaux, selection, dragPositionRef, dragElementIdRef, altitudeEn,
}: VegetauxProps) {
  return (
    <>
      {vegetaux.map((v) => (
        <Suspense key={v.id} fallback={null}>
          <VegetalBillboard
            vegetal={v}
            selected={selection?.has(v.id) ?? false}
            dragPositionRef={dragPositionRef}
            dragElementIdRef={dragElementIdRef}
            altitudeEn={altitudeEn}
          />
        </Suspense>
      ))}
    </>
  );
}

function VegetalBillboard({
  vegetal, selected, dragPositionRef, dragElementIdRef, altitudeEn,
}: {
  vegetal: Vegetal3D;
  selected: boolean;
  dragPositionRef?: React.RefObject<[number, number] | null>;
  dragElementIdRef?: React.RefObject<string | null>;
  altitudeEn?: ((x: number, y: number) => number) | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, vegetal.imageUrl);

  useEffect(() => {
    if (texture.image instanceof HTMLImageElement) {
      garderImageEnCache(vegetal.imageUrl, texture.image);
    }
  }, [texture, vegetal.imageUrl]);

  const largeur = useMemo(() => {
    if (!texture.image) return vegetal.hauteur_m;
    const ratio = texture.image.width / texture.image.height;
    return vegetal.hauteur_m * ratio;
  }, [texture, vegetal.hauteur_m]);

  const basePosition = useMemo(() => {
    const [x, , z] = planVers3D(vegetal.position[0], vegetal.position[1]);
    const altitude = vegetal.altitudeRelative ?? 0;
    return new THREE.Vector3(x, altitude + vegetal.hauteur_m / 2, z);
  }, [vegetal.position, vegetal.hauteur_m, vegetal.altitudeRelative]);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;

    // Pendant le drag, suivre la position du curseur
    if (dragPositionRef?.current && dragElementIdRef?.current === vegetal.id) {
      const [px, py] = dragPositionRef.current;
      const [x, , z] = planVers3D(px, py);
      const alt = altitudeEn ? altitudeEn(px, py) : (vegetal.altitudeRelative ?? 0);
      meshRef.current.position.set(x, alt + vegetal.hauteur_m / 2, z);
    } else {
      meshRef.current.position.copy(basePosition);
    }

    // Billboard rotation
    const dir = new THREE.Vector3();
    dir.subVectors(camera.position, meshRef.current.position);
    meshRef.current.rotation.y = Math.atan2(dir.x, dir.z);

    // Anneau de sélection
    if (ringRef.current) {
      ringRef.current.position.set(
        meshRef.current.position.x,
        meshRef.current.position.y - vegetal.hauteur_m / 2 + 0.02,
        meshRef.current.position.z,
      );
      ringRef.current.visible = selected;
    }
  });

  return (
    <>
      {/* userData.vegetalId identifie la plante ; hauteur_m permet de retrouver son pied */}
      <mesh ref={meshRef} position={basePosition} castShadow
        userData={{ vegetalId: vegetal.id, hauteur_m: vegetal.hauteur_m }}>
        <planeGeometry args={[largeur, vegetal.hauteur_m]} />
        <meshStandardMaterial map={texture} transparent alphaTest={0.1} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={selected}>
          <ringGeometry args={[vegetal.diametre_m / 2 - 0.05, vegetal.diametre_m / 2 + 0.05, 32]} />
          <meshBasicMaterial color="#2563EB" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}
