/**
 * Vérifie que l'exposition de window.__scene3dTest est protégée
 * par le guard process.env.NODE_ENV === "production".
 *
 * En production, Next.js remplace process.env.NODE_ENV par "production"
 * au build, et le dead-code elimination supprime le bloc entier.
 * Ce test vérifie que le code source contient bien ce guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("guard production pour __scene3dTest", () => {
  it("le composant Scene3D contient le guard NODE_ENV === production", () => {
    const source = readFileSync(
      resolve(__dirname, "../composants/Scene3D.tsx"),
      "utf-8",
    );

    // Vérifie que __scene3dTest est dans le fichier
    expect(source).toContain("__scene3dTest");

    // Vérifie que le guard de production est présent
    expect(source).toContain('process.env.NODE_ENV === "production"');

    // Vérifie que le guard est un return anticipé (le code n'expose rien en prod)
    const lines = source.split("\n");
    const guardLine = lines.findIndex((l) =>
      l.includes('process.env.NODE_ENV === "production"'),
    );
    expect(guardLine).toBeGreaterThan(-1);

    // La ligne suivante doit contenir "return"
    const nextLine = lines[guardLine + 1]?.trim();
    expect(
      lines[guardLine].includes("return") || nextLine?.startsWith("return"),
      "Le guard de production doit être suivi d'un return",
    ).toBe(true);
  });
});
