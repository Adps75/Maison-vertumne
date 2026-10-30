"use client";

import { useMemo, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DonneesScene3D, Surface3D, PointCote3D } from "../types";
import type { CameraParams } from "../../camera/types";
import type { Batiment3D } from "../types";
import type { Pt } from "../../geo/plan";
import { Html } from "@react-three/drei";
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
  /** Rapport largeur/hauteur de la photo (pour le calage exact de la caméra). */
  photoAspect?: number;
  /** Afficher la grille de terrain (défaut : true). */
  afficherGrille?: boolean;
  /** Afficher les contours de surfaces (défaut : true). */
  afficherSurfaces?: boolean;
}

export function SceneCalage({ donnees, camera, altitudeEn, photoAspect, afficherGrille = true, afficherSurfaces = true }: SceneCalageProps) {
  // Emprise de la grille : zone active si disponible, sinon emprise complète, pas de 2 m
  const empriseGrille = donnees.zoneContour
    ? empriseDepuisContour(donnees.zoneContour)
    : donnees.emprise;

  return (
    <Canvas
      camera={{ manual: true }}
      gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <Nettoyeur />
      <CameraController params={camera} altitudeEn={altitudeEn} photoAspect={photoAspect} />
      <BatimentsFilDeFer batiments={donnees.batiments} altitudeEn={altitudeEn} />
      {afficherGrille && (
        <GrilleTerrain emprise={empriseGrille} altitudeEn={altitudeEn} pas={2} />
      )}
      {afficherSurfaces && (
        <SurfacesContour surfaces={donnees.surfaces} altitudeEn={altitudeEn} />
      )}
      {donnees.zoneContour && (
        <ZoneContour points={donnees.zoneContour} altitudeEn={altitudeEn} />
      )}
      <PointsCotesMarqueurs pointsCotes={donnees.pointsCotes} altitudeEn={altitudeEn} />
    </Canvas>
  );
}

/** Calcule l'emprise [xMin, yMin, xMax, yMax] d'un contour de zone. */
function empriseDepuisContour(points: Pt[]): [number, number, number, number] {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [x, y] of points) {
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  return [xMin, yMin, xMax, yMax];
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
  pas = 1,
}: {
  emprise: [number, number, number, number];
  altitudeEn: (x: number, y: number) => number;
  /** Espacement de la grille en mètres (défaut 1 m). */
  pas?: number;
}) {
  const geometry = useMemo(() => {
    const [xMin, yMin, xMax, yMax] = emprise;
    const points: number[] = [];
    const subPas = Math.max(0.5, pas / 2); // sous-échantillonnage pour le relief

    // Lignes est-ouest (Y constant)
    for (let y = Math.ceil(yMin / pas) * pas; y <= yMax; y += pas) {
      for (let x = xMin; x < xMax; x += subPas) {
        const xEnd = Math.min(x + subPas, xMax);
        const [ax, ay, az] = planVers3D(x, y, altitudeEn(x, y));
        const [bx, by, bz] = planVers3D(xEnd, y, altitudeEn(xEnd, y));
        points.push(ax, ay, az, bx, by, bz);
      }
    }

    // Lignes nord-sud (X constant)
    for (let x = Math.ceil(xMin / pas) * pas; x <= xMax; x += pas) {
      for (let y = yMin; y < yMax; y += subPas) {
        const yEnd = Math.min(y + subPas, yMax);
        const [ax, ay, az] = planVers3D(x, y, altitudeEn(x, y));
        const [bx, by, bz] = planVers3D(x, yEnd, altitudeEn(x, yEnd));
        points.push(ax, ay, az, bx, by, bz);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [emprise, altitudeEn, pas]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#FFFF00" opacity={0.5} transparent />
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
// ZoneContour : contour blanc de la zone active.
// ---------------------------------------------------------------------------

function ZoneContour({
  points,
  altitudeEn,
}: {
  points: Pt[];
  altitudeEn: (x: number, y: number) => number;
}) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    const positions: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      const [ax, ay, az] = planVers3D(x1, y1, altitudeEn(x1, y1) + 0.05);
      const [bx, by, bz] = planVers3D(x2, y2, altitudeEn(x2, y2) + 0.05);
      positions.push(ax, ay, az, bx, by, bz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [points, altitudeEn]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#FF8C00" />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// PointsCotesMarqueurs : marqueurs rouges avec altitude pour les points cotés.
// ---------------------------------------------------------------------------

function PointsCotesMarqueurs({
  pointsCotes,
  altitudeEn,
}: {
  pointsCotes: PointCote3D[];
  altitudeEn: (x: number, y: number) => number;
}) {
  if (pointsCotes.length === 0) return null;
  return (
    <>
      {pointsCotes.map((pc, i) => {
        const alt = altitudeEn(pc.x, pc.y);
        const [tx, ty, tz] = planVers3D(pc.x, pc.y, alt);
        const signe = pc.altitudeRelative >= 0 ? "+" : "";
        const texte = `${signe}${pc.altitudeRelative.toFixed(2).replace(".", ",")}`;
        return (
          <group key={i} position={[tx, ty, tz]}>
            <mesh>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshBasicMaterial color="#FF3333" />
            </mesh>
            <Html center distanceFactor={20} style={{ pointerEvents: "none" }}>
              <span style={{
                background: "rgba(0,0,0,0.7)",
                color: "#FF6666",
                padding: "1px 4px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {texte}
              </span>
            </Html>
          </group>
        );
      })}
    </>
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
