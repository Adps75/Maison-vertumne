"use client";

import { useMemo, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { planVers3D } from "../conversion";
import { garderImageEnCache } from "../cache-textures";

interface SolProps {
  orthoUrl: string | null;
  orthoEmprise: [number, number, number, number] | null;
  emprise: [number, number, number, number];
}

/** Sol texturé avec l'orthophoto ou plan vert simple. */
export function Sol({ orthoUrl, orthoEmprise, emprise }: SolProps) {
  if (orthoUrl && orthoEmprise) {
    return <SolTexture orthoUrl={orthoUrl} orthoEmprise={orthoEmprise} />;
  }
  return <SolSimple emprise={emprise} />;
}

function SolTexture({
  orthoUrl,
  orthoEmprise,
}: {
  orthoUrl: string;
  orthoEmprise: [number, number, number, number];
}) {
  const texture = useLoader(THREE.TextureLoader, orthoUrl);

  // Garder l'image en cache mémoire pour éviter un retéléchargement
  useEffect(() => {
    if (texture.image instanceof HTMLImageElement) {
      garderImageEnCache(orthoUrl, texture.image);
    }
  }, [texture, orthoUrl]);

  const [cx, cy, cz] = useMemo(() => {
    const mx = (orthoEmprise[0] + orthoEmprise[2]) / 2;
    const my = (orthoEmprise[1] + orthoEmprise[3]) / 2;
    return planVers3D(mx, my, 0);
  }, [orthoEmprise]);

  const largeur = orthoEmprise[2] - orthoEmprise[0];
  const profondeur = orthoEmprise[3] - orthoEmprise[1];

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, cy, cz]} receiveShadow>
      <planeGeometry args={[largeur, profondeur]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SolSimple({
  emprise,
}: {
  emprise: [number, number, number, number];
}) {
  const [cx, cy, cz] = useMemo(() => {
    const mx = (emprise[0] + emprise[2]) / 2;
    const my = (emprise[1] + emprise[3]) / 2;
    return planVers3D(mx, my, 0);
  }, [emprise]);

  const largeur = emprise[2] - emprise[0];
  const profondeur = emprise[3] - emprise[1];

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, cy, cz]} receiveShadow>
      <planeGeometry args={[largeur, profondeur]} />
      <meshStandardMaterial color="#7CB342" side={THREE.DoubleSide} />
    </mesh>
  );
}
