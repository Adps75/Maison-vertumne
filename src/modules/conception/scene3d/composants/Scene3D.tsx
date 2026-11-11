"use client";

import { Suspense, useMemo, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { DonneesScene3D } from "../types";
import type { RaycastCallbacks } from "../interaction-vegetaux";
import type { PlanteSelectionnee } from "../../types";
import { planVers3D } from "../conversion";
import { Sol } from "./Sol";
import { Batiments } from "./Batiment";
import { SurfacesDessinee } from "./SurfaceDessinee";
import { Vegetaux } from "./Vegetal";
import { PreviewVegetal } from "./PreviewVegetal";
import { GestionnairePointeurTerrain } from "./GestionnairePointeurTerrain";
import { Eclairage } from "./Eclairage";
import { Nettoyeur } from "./Nettoyeur";

/** Données exposées sur window.__scene3dTest en développement/test uniquement. */
export interface Scene3DTestData {
  batiments: number;
  surfaces: number;
  vegetaux: {
    id: string;
    position: [number, number];
    hauteur_m: number;
    altitudeRelative: number;
  }[];
}

export interface Scene3DRef {
  vuePieton: () => void;
}

interface Scene3DProps {
  donnees: DonneesScene3D;
  selection?: Set<string>;
  planteAPoser?: PlanteSelectionnee | null;
  previewPositionRef?: React.RefObject<[number, number] | null>;
  dragPositionRef?: React.RefObject<[number, number] | null>;
  dragElementIdRef?: React.RefObject<string | null>;
  isDraggingRef?: React.RefObject<boolean>;
  raycastCallbacks?: RaycastCallbacks;
  onDragMove?: (screenX: number, screenY: number, terrainX: number, terrainY: number) => void;
  downScreenRef?: React.RefObject<[number, number] | null>;
}

export const Scene3D = forwardRef<Scene3DRef, Scene3DProps>(
  function Scene3D({
    donnees, selection, planteAPoser,
    previewPositionRef, dragPositionRef, dragElementIdRef, isDraggingRef,
    raycastCallbacks, onDragMove, downScreenRef,
  }, ref) {
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
          altitudeRelative: v.altitudeRelative,
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
        const mx = (e[0] + e[2]) / 2;
        const my = (e[1] + e[3]) / 2;
        const [cx, , cz] = planVers3D(mx, my);

        // Placer la caméra au bord sud de l'emprise, à hauteur d'œil
        const bx2d = (e[0] + e[2]) / 2;
        const by2d = e[1];
        const [bx, , bz] = planVers3D(bx2d, by2d);

        // Altitude du terrain au point de la caméra et de la cible
        const altCamera = donnees.altitudeEn ? donnees.altitudeEn(bx2d, by2d) : 0;
        const altCible = donnees.altitudeEn ? donnees.altitudeEn(mx, my) : 0;

        controls.object.position.set(bx, altCamera + 1.6, bz);
        controls.target.set(cx, altCible + 1.6, cz);
        controls.update();
      },
    }), [donnees.emprise, donnees.altitudeEn]);

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
        <Nettoyeur />
        <Suspense fallback={null}>
          <Eclairage emprise={donnees.emprise} />
          <Sol
            orthoUrl={donnees.orthoUrl}
            orthoEmprise={donnees.orthoEmprise}
            emprise={donnees.emprise}
            altitudeEn={donnees.altitudeEn}
          />
          <Batiments batiments={donnees.batiments} altitudeEn={donnees.altitudeEn} />
          <SurfacesDessinee surfaces={donnees.surfaces} altitudeEn={donnees.altitudeEn} />
          <Vegetaux
            vegetaux={donnees.vegetaux}
            selection={selection}
            dragPositionRef={dragPositionRef}
            dragElementIdRef={dragElementIdRef}
            altitudeEn={donnees.altitudeEn}
          />
          {planteAPoser && previewPositionRef && (
            <PreviewVegetal
              planteId={planteAPoser.id}
              version={planteAPoser.version}
              hauteur_m={planteAPoser.hauteur_m}
              positionRef={previewPositionRef}
              altitudeEn={donnees.altitudeEn}
            />
          )}
          {raycastCallbacks && (
            <GestionnairePointeurTerrain
              emprise={donnees.emprise}
              altitudeEn={donnees.altitudeEn}
              callbacks={raycastCallbacks}
              onDragMove={onDragMove}
              downScreenRef={downScreenRef}
            />
          )}
          {isDraggingRef && (
            <OrbitControlsGuard controlsRef={controlsRef} isDraggingRef={isDraggingRef} />
          )}
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

/** Désactive les OrbitControls pendant un drag de plante (via useFrame, pas de re-render). */
function OrbitControlsGuard({
  controlsRef,
  isDraggingRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isDraggingRef: React.RefObject<boolean>;
}) {
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !isDraggingRef.current;
    }
  });
  return null;
}
