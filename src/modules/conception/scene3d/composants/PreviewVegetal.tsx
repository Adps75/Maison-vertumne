"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { planVers3D } from "../conversion";
import { garderImageEnCache } from "../cache-textures";

interface Props {
  planteId: string;
  version: string;
  hauteur_m: number;
  positionRef: React.RefObject<[number, number] | null>;
  altitudeEn: ((x: number, y: number) => number) | null;
}

export function PreviewVegetal({ planteId, version, hauteur_m, positionRef, altitudeEn }: Props) {
  return (
    <Suspense fallback={null}>
      <PreviewBillboard
        planteId={planteId}
        version={version}
        hauteur_m={hauteur_m}
        positionRef={positionRef}
        altitudeEn={altitudeEn}
      />
    </Suspense>
  );
}

function PreviewBillboard({ planteId, version, hauteur_m, positionRef, altitudeEn }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const imageUrl = `/api/conception/plantes/${planteId}/image/face?v=${encodeURIComponent(version)}`;
  const texture = useLoader(THREE.TextureLoader, imageUrl);

  useEffect(() => {
    if (texture.image instanceof HTMLImageElement) {
      garderImageEnCache(imageUrl, texture.image);
    }
  }, [texture, imageUrl]);

  const largeur = useMemo(() => {
    if (!texture.image) return hauteur_m;
    const ratio = texture.image.width / texture.image.height;
    return hauteur_m * ratio;
  }, [texture, hauteur_m]);

  // Mettre à jour la position chaque frame (pas de re-render React)
  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    const pos = positionRef.current;
    if (!pos) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    const [x, , z] = planVers3D(pos[0], pos[1]);
    const alt = altitudeEn ? altitudeEn(pos[0], pos[1]) : 0;
    meshRef.current.position.set(x, alt + hauteur_m / 2, z);
    // Rotation vers la caméra
    const dir = new THREE.Vector3();
    dir.subVectors(camera.position, meshRef.current.position);
    meshRef.current.rotation.y = Math.atan2(dir.x, dir.z);
  });

  return (
    <mesh ref={meshRef} visible={false} userData={{ horsRendu: true }}>
      <planeGeometry args={[largeur, hauteur_m]} />
      <meshStandardMaterial
        map={texture}
        transparent
        opacity={0.5}
        alphaTest={0.05}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
