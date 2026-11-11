import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cameraParamsVersThree, directionVisee, projetterDansImage } from "../projection";
import type { CameraParams } from "../types";

const altPlat = () => 0;

function params(overrides: Partial<CameraParams> = {}): CameraParams {
  return {
    x: 0,
    y: 0,
    hauteur: 1.6,
    cap: 0,
    inclinaison: 0,
    roulis: 0,
    fov_v: 50,
    ...overrides,
  };
}

describe("directionVisee", () => {
  it("cap 0 → direction (0, 0, -1) = nord", () => {
    const dir = directionVisee(0, 0);
    expect(dir.x).toBeCloseTo(0, 4);
    expect(dir.y).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(-1, 4);
  });

  it("cap 90 → direction (1, 0, 0) = est", () => {
    const dir = directionVisee(90, 0);
    expect(dir.x).toBeCloseTo(1, 4);
    expect(dir.y).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(0, 4);
  });

  it("cap 180 → direction (0, 0, 1) = sud", () => {
    const dir = directionVisee(180, 0);
    expect(dir.x).toBeCloseTo(0, 4);
    expect(dir.y).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(1, 4);
  });

  it("cap 270 → direction (-1, 0, 0) = ouest", () => {
    const dir = directionVisee(270, 0);
    expect(dir.x).toBeCloseTo(-1, 4);
    expect(dir.y).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(0, 4);
  });

  it("inclinaison -10° → composante Y négative", () => {
    const dir = directionVisee(0, -10);
    expect(dir.y).toBeLessThan(0);
    // Toujours approximativement vers le nord
    expect(dir.z).toBeLessThan(0);
  });

  it("inclinaison +10° → composante Y positive", () => {
    const dir = directionVisee(0, 10);
    expect(dir.y).toBeGreaterThan(0);
  });
});

describe("cameraParamsVersThree", () => {
  it("position au-dessus du terrain", () => {
    const { position } = cameraParamsVersThree(params({ x: 5, y: 10, hauteur: 1.6 }), altPlat);
    // planVers3D(5, 10) = [5, 0, -10]
    expect(position.x).toBeCloseTo(5);
    expect(position.y).toBeCloseTo(1.6);
    expect(position.z).toBeCloseTo(-10);
  });

  it("le quaternion préserve la direction de visée", () => {
    const { quaternion } = cameraParamsVersThree(params({ cap: 90 }), altPlat);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    expect(dir.x).toBeCloseTo(1, 3);
    expect(dir.z).toBeCloseTo(0, 3);
  });
});

describe("projetterDansImage", () => {
  it("point 10 m devant, même hauteur → centre de l'image", () => {
    // Caméra en (0, 0), cap 0 (regarde vers le nord = Y+ en plan)
    // Point à (0, 10) en plan, à hauteur 1.6 m
    const p = params({ x: 0, y: 0, hauteur: 1.6, cap: 0, fov_v: 50 });
    const result = projetterDansImage([0, 10], 1.6, p, altPlat, 800, 600);

    expect(result).not.toBeNull();
    expect(result!.u).toBeCloseTo(0.5, 1);
    expect(result!.v).toBeCloseTo(0.5, 1);
  });

  it("point derrière la caméra → null", () => {
    // Caméra regarde nord, point au sud
    const p = params({ cap: 0 });
    const result = projetterDansImage([0, -10], 1.6, p, altPlat, 800, 600);
    expect(result).toBeNull();
  });

  it("point à droite → u > 0.5", () => {
    // Caméra regarde nord, point à l'est
    const p = params({ cap: 0, fov_v: 50 });
    const result = projetterDansImage([5, 10], 1.6, p, altPlat, 800, 600);
    expect(result).not.toBeNull();
    expect(result!.u).toBeGreaterThan(0.5);
  });
});
