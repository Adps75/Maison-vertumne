import { describe, it, expect } from "vitest";
import { intersecterTerrain, type Vec3 } from "../lancer-rayon";
import { planVers3D } from "../conversion";

const EMPRISE: [number, number, number, number] = [0, 0, 40, 30];

/** Rayon partant de la caméra et passant par un point plan (x, y, h). */
function rayonVers(camera: Vec3, x: number, y: number, h: number): Vec3 {
  const cible = planVers3D(x, y, h);
  return [cible[0] - camera[0], cible[1] - camera[1], cible[2] - camera[2]];
}

describe("intersecterTerrain", () => {
  it("terrain plat à 0 : retrouve le point visé", () => {
    const plat = () => 0;
    const camera: Vec3 = [5, 10, 5];
    const hit = intersecterTerrain(camera, rayonVers(camera, 20, 12, 0), plat, EMPRISE);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(20, 6);
    expect(hit![1]).toBeCloseTo(12, 6);
    expect(hit![2]).toBeCloseTo(0, 6);
  });

  it("plan incliné (2 cm/m vers l'est, comme la fixture E2E) : point exactement sur le rayon", () => {
    const pente = (x: number) => 100 + 0.02 * x;
    const altitudeEn = (x: number) => pente(x);
    const camera: Vec3 = [-5, 101.6, 8];
    for (const [x, y] of [[10, 10], [25, 18], [38, 2]] as const) {
      const hit = intersecterTerrain(camera, rayonVers(camera, x, y, pente(x)), altitudeEn, EMPRISE);
      expect(hit).not.toBeNull();
      expect(hit![0]).toBeCloseTo(x, 4);
      expect(hit![1]).toBeCloseTo(y, 4);
      expect(hit![2]).toBeCloseTo(pente(x), 4);
    }
  });

  it("pente forte : diffère nettement d'un plan horizontal à l'altitude 0", () => {
    // Terrain qui monte de 30 cm par mètre vers le nord, référence 0 au sud
    const altitudeEn = (_x: number, y: number) => 0.3 * y;
    const camera: Vec3 = [20, 3, 2]; // au sud du terrain, à 3 m de haut
    const hit = intersecterTerrain(camera, rayonVers(camera, 20, 15, 4.5), altitudeEn, EMPRISE);
    expect(hit).not.toBeNull();
    expect(hit![1]).toBeCloseTo(15, 4);
    expect(hit![2]).toBeCloseTo(4.5, 4);
  });

  it("relief non linéaire : premier contact avec la bosse, pas le sol derrière", () => {
    // Bosse de 2 m centrée en x = 20
    const altitudeEn = (x: number) => 2 * Math.exp(-((x - 20) ** 2) / 8);
    const camera: Vec3 = [0, 1.5, -15];
    const hit = intersecterTerrain(camera, [1, 0, 0], altitudeEn, EMPRISE);
    expect(hit).not.toBeNull();
    // Premier x où la bosse dépasse 1,5 m, côté caméra
    const xAttendu = 20 - Math.sqrt(-8 * Math.log(1.5 / 2));
    expect(hit![0]).toBeCloseTo(xAttendu, 4);
    expect(hit![2]).toBeCloseTo(1.5, 4);
  });

  it("rayon vers le ciel : aucune intersection", () => {
    const hit = intersecterTerrain([10, 5, -10], [0.3, 1, -0.2], () => 0, EMPRISE);
    expect(hit).toBeNull();
  });

  it("caméra sous le terrain : aucune intersection", () => {
    const hit = intersecterTerrain([10, -1, -10], [1, -0.1, 0], () => 0, EMPRISE);
    expect(hit).toBeNull();
  });

  it("rayon vertical vers le bas", () => {
    const hit = intersecterTerrain([12, 50, -7], [0, -1, 0], (x, y) => 0.1 * x + 0.05 * y, EMPRISE);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(12, 6);
    expect(hit![1]).toBeCloseTo(7, 6);
    expect(hit![2]).toBeCloseTo(1.55, 4);
  });

  it("direction nulle : aucune intersection", () => {
    expect(intersecterTerrain([0, 5, 0], [0, 0, 0], () => 0, EMPRISE)).toBeNull();
  });
});
