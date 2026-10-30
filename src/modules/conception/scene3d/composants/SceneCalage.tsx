"use client";

import { useMemo, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DonneesScene3D, Surface3D } from "../types";
import type { CameraParams } from "../../camera/types";
import type { Batiment3D } from "../types";
import type { Pt } from "../../geo/plan";
import { planVers3D } from "../conversion";
import { cameraParamsVersThree } from "../../camera/projection";
import { Nettoyeur } from "./Nettoyeur";

// ---------------------------------------------------------------------------
// SceneCalage : scène 3D en fil de fer pour le calage caméra sur photo.
// ---------------------------------------------------------------------------

interface SceneCalageProps {
  donnees: DonneesScene3D;
  camera: CameraParams;
  altitudeEn: (x: number, y: number) => number;
}

export function SceneCalage({ donnees, camera, altitudeEn }: SceneCalageProps) {
  return (
    <Canvas
      camera={{ manual: true }}
      gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <Nettoyeur />
      <CameraController params={camera} altitudeEn={altitudeEn} />
      <BatimentsFilDeFer batiments={donnees.batiments} altitudeEn={altitudeEn} />
      <GrilleTerrain emprise={donnees.emprise} altitudeEn={altitudeEn} />
      <SurfacesContour surfaces={donnees.surfaces} altitudeEn={altitudeEn} />
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// CameraController : synchronise la caméra R3F avec les CameraParams.
// ---------------------------------------------------------------------------

function CameraController({
  params,
  altitudeEn,
}: {
  params: CameraParams;
  altitudeEn: (x: number, y: number) => number;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    const { position, quaternion, fov } = cameraParamsVersThree(params, altitudeEn);
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = fov;
    cam.aspect = size.width / size.height;
    cam.near = 0.1;
    cam.far = 1000;
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    cam.updateProjectionMatrix();
  }, [params, altitudeEn, camera, size]);

  return null;
}

// ---------------------------------------------------------------------------
// BatimentsFilDeFer : arêtes des bâtiments en cyan.
// ---------------------------------------------------------------------------

function BatimentsFilDeFer({
  batiments,
  altitudeEn,
}: {
  batiments: Batiment3D[];
  altitudeEn?: ((x: number, y: number) => number) | null;
}) {
  return (
    <>
      {batiments.map((bat, i) => (
        <BatimentEdges key={bat.cleabs || i} batiment={bat} altitudeEn={altitudeEn} />
      ))}
    </>
  );
}

const HAUTEUR_DEFAUT = 6;

function BatimentEdges({
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
        <PolygoneEdges key={i} rings={rings} hauteur={hauteur} minAltitude={minAltitude} />
      ))}
    </>
  );
}

function PolygoneEdges({
  rings,
  hauteur,
  minAltitude = 0,
}: {
  rings: Pt[][];
  hauteur: number;
  minAltitude?: number;
}) {
  const edgesGeometry = useMemo(() => {
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

    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: hauteur,
      bevelEnabled: false,
    });

    return new THREE.EdgesGeometry(extruded, 15);
  }, [rings, hauteur]);

  if (!edgesGeometry) return null;

  return (
    <lineSegments geometry={edgesGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, minAltitude, 0]}>
      <lineBasicMaterial color="#00FFFF" />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// GrilleTerrain : lignes de la grille au sol tous les mètres, en jaune.
// ---------------------------------------------------------------------------

function GrilleTerrain({
  emprise,
  altitudeEn,
}: {
  emprise: [number, number, number, number];
  altitudeEn: (x: number, y: number) => number;
}) {
  const geometry = useMemo(() => {
    const [xMin, yMin, xMax, yMax] = emprise;
    const points: number[] = [];

    // Lignes est-ouest (Y constant)
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      for (let x = xMin; x < xMax; x += 0.5) {
        const xEnd = Math.min(x + 0.5, xMax);
        const [ax, ay, az] = planVers3D(x, y, altitudeEn(x, y));
        const [bx, by, bz] = planVers3D(xEnd, y, altitudeEn(xEnd, y));
        points.push(ax, ay, az, bx, by, bz);
      }
    }

    // Lignes nord-sud (X constant)
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      for (let y = yMin; y < yMax; y += 0.5) {
        const yEnd = Math.min(y + 0.5, yMax);
        const [ax, ay, az] = planVers3D(x, y, altitudeEn(x, y));
        const [bx, by, bz] = planVers3D(x, yEnd, altitudeEn(x, yEnd));
        points.push(ax, ay, az, bx, by, bz);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [emprise, altitudeEn]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#FFFF00" />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// SurfacesContour : contour des surfaces en couleur.
// ---------------------------------------------------------------------------

function SurfacesContour({
  surfaces,
  altitudeEn,
}: {
  surfaces: Surface3D[];
  altitudeEn: (x: number, y: number) => number;
}) {
  return (
    <>
      {surfaces.map((s) => (
        <SurfaceContour key={s.id} surface={s} altitudeEn={altitudeEn} />
      ))}
    </>
  );
}

function SurfaceContour({
  surface,
  altitudeEn,
}: {
  surface: Surface3D;
  altitudeEn: (x: number, y: number) => number;
}) {
  const geometry = useMemo(() => {
    const pts = surface.points;
    if (pts.length < 3) return null;

    const positions: number[] = [];
    // Paires de segments pour lineSegments
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const alt1 = altitudeEn(x1, y1);
      const alt2 = altitudeEn(x2, y2);
      const [ax, ay, az] = planVers3D(x1, y1, alt1 + 0.02);
      const [bx, by, bz] = planVers3D(x2, y2, alt2 + 0.02);
      positions.push(ax, ay, az, bx, by, bz);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [surface.points, altitudeEn]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={surface.couleur} />
    </lineSegments>
  );
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
