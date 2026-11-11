"use client";

import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import type { DonneesScene3D } from "../types";
import type { CameraParams } from "../../camera/types";
import type { TraitPlan } from "../traits-construction";
import { Nettoyeur } from "./Nettoyeur";
import { TraitsConstruction } from "./TraitsConstruction";
import { CameraController, BatimentsOccludeurs, TerrainOccludeur } from "./SceneVisuel";

/**
 * Scène superposée au Visuel, dédiée aux traits de construction.
 *
 * Elle est volontairement séparée de la scène principale :
 * - l'export PNG ne lit que la scène principale, les traits n'y figurent donc jamais ;
 * - elle est transparente aux événements (pointer-events: none), les clics et le
 *   glisser des plantes atteignent la scène principale.
 * Même caméra que la scène principale ; terrain et bâtiments n'écrivent que la
 * profondeur, pour masquer les traits situés derrière eux.
 */
export function SceneTraits({
  donnees,
  camera,
  altitudeEn,
  photoAspect,
  traits,
}: {
  donnees: DonneesScene3D;
  camera: CameraParams;
  altitudeEn: (x: number, y: number) => number;
  photoAspect?: number;
  traits: TraitPlan[];
}) {
  return (
    <Canvas
      camera={{ manual: true }}
      gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
      style={{ background: "transparent", pointerEvents: "none" }}
    >
      <Nettoyeur />
      <CameraController params={camera} altitudeEn={altitudeEn} photoAspect={photoAspect} />
      <BatimentsOccludeurs batiments={donnees.batiments} altitudeEn={altitudeEn} />
      <TerrainOccludeur emprise={donnees.emprise} altitudeEn={altitudeEn} profondeurSeule />
      <TraitsConstruction traits={traits} altitudeEn={altitudeEn} />
      <DonneesTestTraits traits={traits} />
    </Canvas>
  );
}

/** Données exposées sur window.__traitsTest en développement/test uniquement. */
export interface TraitsTestData {
  traits_rendus: number;
  ids: string[];
}

function DonneesTestTraits({ traits }: { traits: TraitPlan[] }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const data: TraitsTestData = { traits_rendus: traits.length, ids: traits.map((t) => t.id) };
    (window as unknown as Record<string, unknown>).__traitsTest = data;
    return () => {
      delete (window as unknown as Record<string, unknown>).__traitsTest;
    };
  }, [traits]);
  return null;
}
