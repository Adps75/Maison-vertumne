"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Surface3D } from "../types";

interface SurfaceDessineeProps {
  surfaces: Surface3D[];
}

/** Surfaces dessinées (sol, minéral) comme polygones colorés légèrement au-dessus du sol. */
export function SurfacesDessinee({ surfaces }: SurfaceDessineeProps) {
  return (
    <>
      {surfaces.map((s) => (
        <SurfaceMesh key={s.id} surface={s} />
      ))}
    </>
  );
}

function SurfaceMesh({ surface }: { surface: Surface3D }) {
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

  if (!geometry) return null;

  // ShapeGeometry dans le plan XY → rotation -π/2 sur X pour poser à plat dans XZ.
  // Même convention que les bâtiments : y_plan → -z_three.
  // Position Y = 0.02 m pour être 2 cm au-dessus du sol.
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
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
