"use client";

import { Suspense, useMemo, useEffect, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DonneesScene3D } from "../types";
import type { Batiment3D } from "../types";
import type { CameraParams, SoleilParams } from "../../camera/types";
import type { Pt } from "../../geo/plan";
import { planVers3D } from "../conversion";
import { cameraParamsVersThree, soleilVersPosition } from "../../camera/projection";
import { Nettoyeur } from "./Nettoyeur";
import { Vegetaux } from "./Vegetal";

// ---------------------------------------------------------------------------
// SceneVisuel : scène 3D pour superposition végétaux sur photo.
// Bâtiments et terrain en occludeurs invisibles, ombres portées.
// ---------------------------------------------------------------------------

/** Données exposées sur window.__visuelTest en développement/test uniquement. */
export interface VisuelTestData {
  vegetaux_rendus: number;
}

interface SceneVisuelProps {
  donnees: DonneesScene3D;
  camera: CameraParams;
  soleil: SoleilParams;
  altitudeEn: (x: number, y: number) => number;
  photoAspect?: number;
}

export function SceneVisuel({ donnees, camera, soleil, altitudeEn, photoAspect }: SceneVisuelProps) {
  return (
    <Canvas
      shadows
      camera={{ manual: true }}
      gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <Nettoyeur />
      <CameraController params={camera} altitudeEn={altitudeEn} photoAspect={photoAspect} />
      <EclairageVisuel emprise={donnees.emprise} soleil={soleil} />
      <Suspense fallback={null}>
        <Vegetaux vegetaux={donnees.vegetaux} />
      </Suspense>
      <BatimentsOccludeurs batiments={donnees.batiments} altitudeEn={altitudeEn} />
      <TerrainOccludeur emprise={donnees.emprise} altitudeEn={altitudeEn} />
      <DonneesTest vegetauxCount={donnees.vegetaux.length} />
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// CameraController : synchronise la caméra R3F avec les CameraParams.
// ---------------------------------------------------------------------------

function CameraController({
  params,
  altitudeEn,
  photoAspect,
}: {
  params: CameraParams;
  altitudeEn: (x: number, y: number) => number;
  photoAspect?: number;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    const { position, quaternion, fov } = cameraParamsVersThree(params, altitudeEn);
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = fov;
    cam.aspect = photoAspect ?? (size.width / size.height);
    cam.near = 0.1;
    cam.far = 1000;
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    cam.updateProjectionMatrix();
  }, [params, altitudeEn, camera, size, photoAspect]);

  return null;
}

// ---------------------------------------------------------------------------
// EclairageVisuel : directionnel selon le soleil + ambiant faible.
// ---------------------------------------------------------------------------

function EclairageVisuel({
  emprise,
  soleil,
}: {
  emprise: [number, number, number, number];
  soleil: SoleilParams;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  const { lightPos, targetPos, shadowSize } = useMemo(() => {
    const cx = (emprise[0] + emprise[2]) / 2;
    const cy = (emprise[1] + emprise[3]) / 2;
    const pos = soleilVersPosition(soleil, [cx, cy], 100);

    const [tx, , tz] = planVers3D(cx, cy);
    const target = new THREE.Vector3(tx, 0, tz);

    const largeur = emprise[2] - emprise[0];
    const profondeur = emprise[3] - emprise[1];
    const taille = Math.max(largeur, profondeur) * 0.6;

    return { lightPos: pos, targetPos: target, shadowSize: taille };
  }, [emprise, soleil]);

  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.target.position.copy(targetPos);
      lightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight
        ref={lightRef}
        position={lightPos}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// BatimentsOccludeurs : bâtiments invisibles qui masquent les végétaux.
// ---------------------------------------------------------------------------

function BatimentsOccludeurs({
  batiments,
  altitudeEn,
}: {
  batiments: Batiment3D[];
  altitudeEn?: ((x: number, y: number) => number) | null;
}) {
  return (
    <>
      {batiments.map((bat, i) => (
        <BatimentOccludeur key={bat.cleabs || i} batiment={bat} altitudeEn={altitudeEn} />
      ))}
    </>
  );
}

const HAUTEUR_DEFAUT = 6;

function BatimentOccludeur({
  batiment,
  altitudeEn,
}: {
  batiment: Batiment3D;
  altitudeEn?: ((x: number, y: number) => number) | null;
}) {
  const hauteur = batiment.hauteur ?? HAUTEUR_DEFAUT;
  const polygones = useMemo(() => extrairePolygones(batiment), [batiment]);

  const minAltitude = useMemo(() => {
    if (!altitudeEn) return 0;
    let min = Infinity;
    for (const rings of polygones) {
      const outer = rings[0];
      if (!outer) continue;
      for (const [x, y] of outer) {
        const alt = altitudeEn(x, y);
        if (alt < min) min = alt;
      }
    }
    return min === Infinity ? 0 : min;
  }, [altitudeEn, polygones]);

  return (
    <>
      {polygones.map((rings, i) => (
        <PolygoneOccludeur key={i} rings={rings} hauteur={hauteur} minAltitude={minAltitude} />
      ))}
    </>
  );
}

function PolygoneOccludeur({
  rings,
  hauteur,
  minAltitude = 0,
}: {
  rings: Pt[][];
  hauteur: number;
  minAltitude?: number;
}) {
  const geometry = useMemo(() => {
    const outer = rings[0];
    if (!outer || outer.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) {
      shape.lineTo(outer[i][0], outer[i][1]);
    }
    shape.closePath();

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

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, minAltitude, 0]}>
      <meshBasicMaterial colorWrite={false} depthWrite={true} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// TerrainOccludeur : maillage du terrain qui reçoit les ombres et occlut.
// ---------------------------------------------------------------------------

function TerrainOccludeur({
  emprise,
  altitudeEn,
}: {
  emprise: [number, number, number, number];
  altitudeEn: (x: number, y: number) => number;
}) {
  const geometry = useMemo(() => {
    const PAS = 0.5;
    const [xMin, yMin, xMax, yMax] = emprise;

    const nbX = Math.ceil((xMax - xMin) / PAS) + 1;
    const nbY = Math.ceil((yMax - yMin) / PAS) + 1;

    const positions = new Float32Array(nbX * nbY * 3);

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
      }
    }

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
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    return geo;
  }, [emprise, altitudeEn]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <shadowMaterial opacity={0.4} transparent depthWrite={true} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// DonneesTest : expose les données de test en développement.
// ---------------------------------------------------------------------------

function DonneesTest({ vegetauxCount }: { vegetauxCount: number }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const testData: VisuelTestData = {
      vegetaux_rendus: vegetauxCount,
    };
    (window as unknown as Record<string, unknown>).__visuelTest = testData;

    return () => {
      delete (window as unknown as Record<string, unknown>).__visuelTest;
    };
  }, [vegetauxCount]);

  return null;
}

// ---------------------------------------------------------------------------
// Utilitaire : extraction polygones (même logique que Batiment.tsx).
// ---------------------------------------------------------------------------

function extrairePolygones(bat: Batiment3D): Pt[][][] {
  const geom = bat.geometry;

  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as number[][][][]).map((poly) =>
      poly.map((ring) => ring.map(([x, y]) => [x, y] as Pt)),
    );
  }

  return [
    (geom.coordinates as number[][][]).map((ring) =>
      ring.map(([x, y]) => [x, y] as Pt),
    ),
  ];
}
