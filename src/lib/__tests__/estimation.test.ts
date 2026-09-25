import { describe, it, expect } from "vitest";
import { nombreEtapes, NOMBRE_ETAPES } from "../types/estimation";

describe("nombreEtapes", () => {
  it("renvoie 8 étapes pour le parcours maison", () => {
    expect(nombreEtapes("maison")).toBe(8);
  });

  it("renvoie 8 étapes pour le parcours appartement", () => {
    expect(nombreEtapes("appartement")).toBe(8);
  });

  it("renvoie le total par défaut quand typeLieu est indéfini", () => {
    expect(nombreEtapes(undefined)).toBe(NOMBRE_ETAPES);
  });

  it("NOMBRE_ETAPES vaut 8", () => {
    expect(NOMBRE_ETAPES).toBe(8);
  });
});
