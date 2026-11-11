"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RaycastCallbacks } from "../interaction-vegetaux";
import { intersecterTerrain } from "../lancer-rayon";

const ALTITUDE_NULLE = () => 0;

interface Props {
  emprise: [number, number, number, number];
  /** Altitude du terrain ; null = terrain plat à 0. */
  altitudeEn: ((x: number, y: number) => number) | null | undefined;
  callbacks: RaycastCallbacks;
  onDragMove?: (screenX: number, screenY: number, terrainX: number, terrainY: number) => void;
  downScreenRef?: React.RefObject<[number, number] | null>;
}

/**
 * Gestion de tous les événements pointeur de la vue 3D (clic, glisser) via le
 * canvas DOM natif, partagée par Scene3D et SceneVisuel.
 *
 * - pointerdown : capture du pointeur, lancer de rayon sur la scène (plante
 *   touchée ?) puis sur le relief.
 * - Quand on attrape une plante, l'écart écran entre le curseur et le pied de
 *   la plante est mémorisé : pendant le glisser, le rayon est lancé depuis ce
 *   point décalé, si bien que le pied reste exactement au même endroit sous le
 *   curseur, quelle que soit la pente ou la perspective.
 * - pointerup : fin du clic ou du glisser, libération du pointeur.
 * - pointercancel : annulation propre du glisser, libération du pointeur.
 *
 * Le relief est visé par intersecterTerrain (même altitudeEn que celle qui
 * pose les plantes), jamais par un plan horizontal.
 */
export function GestionnairePointeurTerrain({
  emprise, altitudeEn, callbacks, onDragMove, downScreenRef,
}: Props) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // Dernières valeurs des props, lues par les écouteurs DOM (jamais d'ancienne valeur)
  const cbRef = useRef(callbacks);
  const dragMoveRef = useRef(onDragMove);
  const altitudeRef = useRef(altitudeEn ?? ALTITUDE_NULLE);
  const empriseRef = useRef(emprise);
  useLayoutEffect(() => {
    cbRef.current = callbacks;
    dragMoveRef.current = onDragMove;
    altitudeRef.current = altitudeEn ?? ALTITUDE_NULLE;
    empriseRef.current = emprise;
  });

  const versNdc = useCallback((clientX: number, clientY: number): THREE.Vector2 => {
    const r = gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
  }, [gl]);

  /** Point du relief sous un pixel écran, en coordonnées plan. */
  const raycastTerrain = useCallback((clientX: number, clientY: number): [number, number] | null => {
    raycaster.setFromCamera(versNdc(clientX, clientY), camera);
    const { origin, direction } = raycaster.ray;
    const hit = intersecterTerrain(
      [origin.x, origin.y, origin.z],
      [direction.x, direction.y, direction.z],
      altitudeRef.current,
      empriseRef.current,
    );
    return hit ? [hit[0], hit[1]] : null;
  }, [camera, raycaster, versNdc]);

  /** Première plante sous un pixel écran, avec la position écran de son pied. */
  const raycastVegetal = useCallback((clientX: number, clientY: number): { id: string; pied: [number, number] | null } | null => {
    raycaster.setFromCamera(versNdc(clientX, clientY), camera);
    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      const id = hit.object.userData?.vegetalId;
      if (typeof id !== "string") continue;
      const hauteur = hit.object.userData?.hauteur_m;
      let pied: [number, number] | null = null;
      if (typeof hauteur === "number") {
        const p = hit.object.getWorldPosition(new THREE.Vector3());
        p.y -= hauteur / 2;
        p.project(camera);
        if (p.z > -1 && p.z < 1) {
          const r = gl.domElement.getBoundingClientRect();
          pied = [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
        }
      }
      return { id, pied };
    }
    return null;
  }, [camera, gl, raycaster, scene, versNdc]);

  useEffect(() => {
    const canvas = gl.domElement;
    let pointeurCapture: number | null = null;
    // Décalage écran (pied de la plante − curseur) pendant un glisser
    let decalage: [number, number] = [0, 0];

    const liberer = () => {
      if (pointeurCapture !== null) {
        try { canvas.releasePointerCapture(pointeurCapture); } catch { /* déjà libéré */ }
        pointeurCapture = null;
      }
    };

    const onDown = (e: PointerEvent) => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà inactif */ }
      pointeurCapture = e.pointerId;
      decalage = [0, 0];

      if (downScreenRef) {
        (downScreenRef as React.MutableRefObject<[number, number] | null>).current = [e.clientX, e.clientY];
      }

      // En placement, on vise toujours le sol (l'écartement décale la nouvelle plante)
      const vegetal = cbRef.current.placementActif ? null : raycastVegetal(e.clientX, e.clientY);
      if (vegetal) {
        let tp: [number, number] | null = null;
        if (vegetal.pied) {
          const d: [number, number] = [vegetal.pied[0] - e.clientX, vegetal.pied[1] - e.clientY];
          tp = raycastTerrain(e.clientX + d[0], e.clientY + d[1]);
          if (tp) decalage = d;
        }
        if (!tp) tp = raycastTerrain(e.clientX, e.clientY);
        if (tp) {
          cbRef.current.onVegetalDown(vegetal.id, tp[0], tp[1]);
          return;
        }
      }

      const tp = raycastTerrain(e.clientX, e.clientY);
      if (tp) cbRef.current.onTerrainClick(tp[0], tp[1]);
      else cbRef.current.onMissClick();
    };

    const onMove = (e: PointerEvent) => {
      const tp = raycastTerrain(e.clientX + decalage[0], e.clientY + decalage[1]);
      if (tp && dragMoveRef.current) dragMoveRef.current(e.clientX, e.clientY, tp[0], tp[1]);
    };

    const onUp = (e: PointerEvent) => {
      if (pointeurCapture !== e.pointerId) return;
      liberer();
      const tp = raycastTerrain(e.clientX + decalage[0], e.clientY + decalage[1]);
      decalage = [0, 0];
      cbRef.current.onPointerUp(tp ? tp[0] : null, tp ? tp[1] : null);
    };

    const onCancel = (e: PointerEvent) => {
      if (pointeurCapture !== e.pointerId) return;
      liberer();
      decalage = [0, 0];
      cbRef.current.onPointerCancel();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      liberer();
    };
  }, [gl, raycastTerrain, raycastVegetal, downScreenRef]);

  return null;
}
