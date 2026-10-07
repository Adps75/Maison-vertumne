"use client";

import { Suspense, useMemo, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { DonneesScene3D } from "../types";
import { planVers3D } from "../conversion";
import { Sol } from "./Sol";
import { Batiments } from "./Batiment";
import { SurfacesDessinee } from "./SurfaceDessinee";
import { Vegetaux } from "./Vegetal";
import { Eclairage } from "./Eclairage";

/** Données exposées sur window.__scene3dTest en développement/test uniquement. */
export interface Scene3DTestData {
  batiments: number;
  surfaces: number;
  vegetaux: {
    id: string;
    position: [number, number];
    hauteur_m: number;
  }[];
}

export interface Scene3DRef {
  vuePieton: () => void;
}

interface Scene3DProps {
  donnees: DonneesScene3D;
}

/** Scène 3D complète avec tous les éléments du projet. */
export const Scene3D = forwardRef<Scene3DRef, Scene3DProps>(
  function Scene3D({ donnees }, ref) {
    const controlsRef = useRef<OrbitControlsImpl>(null);

    // Exposer les données de test en développement uniquement
    useEffect(() => {
      if (process.env.NODE_ENV === "production") return;

      const testData: Scene3DTestData = {
        batiments: donnees.batiments.length,
        surfaces: donnees.surfaces.length,
        vegetaux: donnees.vegetaux.map((v) => ({
          id: v.id,
          position: [v.position[0], v.position[1]] as [number, number],
          hauteur_m: v.hauteur_m,
        })),
      };
      (window as unknown as Record<string, unknown>).__scene3dTest = testData;

      return () => {
        delete (window as unknown as Record<string, unknown>).__scene3dTest;
      };
    }, [donnees]);

    // Position et cible initiales de la caméra
    const cameraConfig = useMemo(() => {
      const e = donnees.emprise;
      const largeur = e[2] - e[0];
      const profondeur = e[3] - e[1];
      const diag = Math.sqrt(largeur ** 2 + profondeur ** 2);
      const dist = Math.max(diag * 0.8, 20);

      const [cx, , cz] = planVers3D(
        (e[0] + e[2]) / 2,
        (e[1] + e[3]) / 2,
      );

      return {
        position: [cx, dist * 0.7, cz + dist * 0.7] as [number, number, number],
        target: [cx, 0, cz] as [number, number, number],
      };
    }, [donnees.emprise]);

    // Vue piéton : caméra à 1,60 m de hauteur
    useImperativeHandle(ref, () => ({
      vuePieton() {
        const controls = controlsRef.current;
        if (!controls) return;

        const e = donnees.emprise;
        const [cx, , cz] = planVers3D(
          (e[0] + e[2]) / 2,
          (e[1] + e[3]) / 2,
        );

        // Placer la caméra au bord sud de l'emprise, à hauteur d'œil
        const [bx, , bz] = planVers3D(
          (e[0] + e[2]) / 2,
          e[1],
        );

        controls.object.position.set(bx, 1.6, bz);
        controls.target.set(cx, 1.6, cz);
        controls.update();
      },
    }), [donnees.emprise]);

    return (
      <Canvas
        shadows
        camera={{
          fov: 50,
          near: 0.1,
          far: 1000,
          position: cameraConfig.position,
        }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Eclairage emprise={donnees.emprise} />
          <Sol
            orthoUrl={donnees.orthoUrl}
            orthoEmprise={donnees.orthoEmprise}
            emprise={donnees.emprise}
          />
          <Batiments batiments={donnees.batiments} />
          <SurfacesDessinee surfaces={donnees.surfaces} />
          <Vegetaux vegetaux={donnees.vegetaux} />
          <OrbitControls
            ref={controlsRef}
            target={cameraConfig.target}
            enableDamping
            dampingFactor={0.1}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Suspense>
      </Canvas>
    );
  },
);
