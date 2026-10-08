"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Surface3D } from "../types";

interface SurfaceDessineeProps {
  surfaces: Surface3D[];
  altitudeEn?: ((x: number, y: number) => number) | null;
}

/** Surfaces dessinées (sol, minéral) comme polygones colorés légèrement au-dessus du sol. */
export function SurfacesDessinee({ surfaces, altitudeEn }: SurfaceDessineeProps) {
  return (
    <>
      {surfaces.map((s) => (
        <SurfaceMesh key={s.id} surface={s} altitudeEn={altitudeEn} />
      ))}
    </>
  );
}

function SurfaceMesh({
  surface,
  altitudeEn,
}: {
  surface: Surface3D;
  altitudeEn?: ((x: number, y: number) => number) | null;
}) {
  const geometry = useMemo(() => {
    const pts = surface.points;
    if (pts.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [surface.points]);

  // Calculer l'altitude moyenne des sommets si relief disponible
  const altitudeMoyenne = useMemo(() => {
    if (!altitudeEn || surface.points.length === 0) return 0;
    let somme = 0;
    for (const [x, y] of surface.points) {
      somme += altitudeEn(x, y);
    }
    return somme / surface.points.length;
  }, [altitudeEn, surface.points]);

  if (!geometry) return null;

  // ShapeGeometry dans le plan XY → rotation -π/2 sur X pour poser à plat dans XZ.
  // Même convention que les bâtiments : y_plan → -z_three.
  // Position Y = altitude moyenne + 0.02 m pour être 2 cm au-dessus du sol.
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, altitudeMoyenne + 0.02, 0]}>
      <meshStandardMaterial
        color={surface.couleur}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
