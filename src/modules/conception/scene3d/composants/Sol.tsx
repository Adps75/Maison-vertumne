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
  altitudeEn?: ((x: number, y: number) => number) | null;
}

/** Sol texturé avec l'orthophoto ou plan vert simple. */
export function Sol({ orthoUrl, orthoEmprise, emprise, altitudeEn }: SolProps) {
  if (orthoUrl && orthoEmprise) {
    if (altitudeEn) {
      return (
        <SolRelief
          orthoUrl={orthoUrl}
          orthoEmprise={orthoEmprise}
          emprise={emprise}
          altitudeEn={altitudeEn}
        />
      );
    }
    return <SolTexture orthoUrl={orthoUrl} orthoEmprise={orthoEmprise} />;
  }
  return <SolSimple emprise={emprise} />;
}

/** Sol avec relief, texturé par l'orthophoto. */
function SolRelief({
  orthoUrl,
  orthoEmprise,
  emprise,
  altitudeEn,
}: {
  orthoUrl: string;
  orthoEmprise: [number, number, number, number];
  emprise: [number, number, number, number];
  altitudeEn: (x: number, y: number) => number;
}) {
  const texture = useLoader(THREE.TextureLoader, orthoUrl);

  useEffect(() => {
    if (texture.image instanceof HTMLImageElement) {
      garderImageEnCache(orthoUrl, texture.image);
    }
  }, [texture, orthoUrl]);

  const geometry = useMemo(() => {
    const PAS = 0.5; // mètres
    const xMin = emprise[0];
    const yMin = emprise[1];
    const xMax = emprise[2];
    const yMax = emprise[3];

    const nbX = Math.ceil((xMax - xMin) / PAS) + 1;
    const nbY = Math.ceil((yMax - yMin) / PAS) + 1;

    const positions = new Float32Array(nbX * nbY * 3);
    const uvs = new Float32Array(nbX * nbY * 2);

    const orthoLargeur = orthoEmprise[2] - orthoEmprise[0];
    const orthoHauteur = orthoEmprise[3] - orthoEmprise[1];

    for (let iy = 0; iy < nbY; iy++) {
      for (let ix = 0; ix < nbX; ix++) {
        const x = xMin + ix * PAS;
        const y = yMin + iy * PAS;
        const alt = altitudeEn(x, y);
        const [tx, ty, tz] = planVers3D(x, y, alt);

        const idx = (iy * nbX + ix) * 3;
        positions[idx] = tx;
        positions[idx + 1] = ty;
        positions[idx + 2] = tz;

        const uvIdx = (iy * nbX + ix) * 2;
        uvs[uvIdx] = orthoLargeur > 0 ? (x - orthoEmprise[0]) / orthoLargeur : 0;
        uvs[uvIdx + 1] = orthoHauteur > 0 ? (y - orthoEmprise[1]) / orthoHauteur : 0;
      }
    }

    // Indices : 2 triangles par cellule de la grille
    const nbCellsX = nbX - 1;
    const nbCellsY = nbY - 1;
    const indices = new Uint32Array(nbCellsX * nbCellsY * 6);
    let k = 0;

    for (let iy = 0; iy < nbCellsY; iy++) {
      for (let ix = 0; ix < nbCellsX; ix++) {
        const a = iy * nbX + ix;
        const b = a + 1;
        const c = a + nbX;
        const d = c + 1;

        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;

        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    return geo;
  }, [emprise, orthoEmprise, altitudeEn]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
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
