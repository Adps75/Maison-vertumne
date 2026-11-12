import * as THREE from "three";
import type { CameraParams, SoleilParams } from "./types";
import { planVers3D } from "../scene3d/conversion";

const DEG = Math.PI / 180;

/**
 * Convertit les paramètres caméra du projet en position/orientation Three.js.
 *
 * Convention :
 * - Plan : X = est, Y = nord.
 * - Three.js : X = est, Y = haut, Z = -nord.
 * - Caméra sans rotation : regarde vers -Z (= nord).
 * - Cap 0 = nord → yaw = 0.
 * - Cap 90 = est → yaw = -π/2.
 * - Inclinaison positive = regarde vers le haut.
 * - Euler "YXZ" : yaw (Y), pitch (X), roll (Z).
 */
export function cameraParamsVersThree(
  params: CameraParams,
  altitudeEn: (x: number, y: number) => number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } {
  const [tx, , tz] = planVers3D(params.x, params.y);
  const alt = altitudeEn(params.x, params.y) + params.hauteur;
  const position = new THREE.Vector3(tx, alt, tz);

  const yaw = -params.cap * DEG;
  const pitch = params.inclinaison * DEG;
  const roll = params.roulis * DEG;

  const euler = new THREE.Euler(pitch, yaw, roll, "YXZ");
  const quaternion = new THREE.Quaternion().setFromEuler(euler);

  return { position, quaternion, fov: params.fov_v };
}

/**
 * Direction de visée de la caméra (vecteur unitaire) depuis les paramètres.
 */
export function directionVisee(cap: number, inclinaison: number): THREE.Vector3 {
  const yaw = -cap * DEG;
  const pitch = inclinaison * DEG;
  // Direction initiale : (0, 0, -1) = nord
  const dir = new THREE.Vector3(0, 0, -1);
  const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
  dir.applyEuler(euler);
  return dir;
}

/** Projecteur d'une vue : caméra construite une seule fois, puis projection de nombreux points. */
export type Projecteur = (pointPlan: [number, number], hauteurPoint: number) => { u: number; v: number } | null;

/**
 * Crée un projecteur pour une vue calée : point du plan (et hauteur absolue Three.js)
 * → coordonnées normalisées 0–1 dans l'image ; null si le point est derrière la caméra.
 */
export function creerProjecteur(
  params: CameraParams,
  altitudeEn: (x: number, y: number) => number,
  largeurPx: number,
  hauteurPx: number,
): Projecteur {
  const { position, quaternion, fov } = cameraParamsVersThree(params, altitudeEn);
  const camera = new THREE.PerspectiveCamera(fov, largeurPx / hauteurPx, 0.1, 1000);
  camera.position.copy(position);
  camera.quaternion.copy(quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const point = new THREE.Vector3();
  return (pointPlan, hauteurPoint) => {
    const [px, , pz] = planVers3D(pointPlan[0], pointPlan[1]);
    point.set(px, hauteurPoint, pz).project(camera);
    if (point.z > 1) return null; // derrière la caméra
    return { u: (point.x + 1) / 2, v: (1 - point.y) / 2 };
  };
}

/**
 * Projette un point 3D du plan dans l'image (coordonnées normalisées 0–1).
 * Retourne null si le point est derrière la caméra.
 */
export function projetterDansImage(
  pointPlan: [number, number],
  hauteurPoint: number,
  params: CameraParams,
  altitudeEn: (x: number, y: number) => number,
  largeurPx: number,
  hauteurPx: number,
): { u: number; v: number } | null {
  return creerProjecteur(params, altitudeEn, largeurPx, hauteurPx)(pointPlan, hauteurPoint);
}

/**
 * Convertit les paramètres du soleil en position Three.js pour une lumière directionnelle.
 */
export function soleilVersPosition(
  soleil: SoleilParams,
  centre: [number, number],
  distance = 100,
): THREE.Vector3 {
  const azRad = -soleil.azimut * DEG;
  const elRad = soleil.elevation * DEG;

  const [cx, , cz] = planVers3D(centre[0], centre[1]);

  return new THREE.Vector3(
    cx + distance * Math.sin(azRad) * Math.cos(elRad),
    distance * Math.sin(elRad),
    cz + distance * (-Math.cos(azRad)) * Math.cos(elRad),
  );
}
