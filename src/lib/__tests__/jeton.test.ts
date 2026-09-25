import { describe, it, expect } from "vitest";
import { genererJeton, hacherJeton } from "../jeton";

// genererJeton et hacherJeton importent "server-only" qui bloque en dehors de Next.
// On mock le module pour les tests.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("genererJeton", () => {
  it("renvoie une chaîne de 64 caractères hexadécimaux", () => {
    const jeton = genererJeton();
    expect(jeton).toMatch(/^[0-9a-f]{64}$/);
  });

  it("génère des jetons uniques", () => {
    const a = genererJeton();
    const b = genererJeton();
    expect(a).not.toBe(b);
  });
});

describe("hacherJeton", () => {
  it("renvoie une empreinte SHA-256 de 64 caractères", () => {
    const hash = hacherJeton("test-jeton");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("est déterministe", () => {
    const a = hacherJeton("même-jeton");
    const b = hacherJeton("même-jeton");
    expect(a).toBe(b);
  });

  it("produit des empreintes différentes pour des jetons différents", () => {
    const a = hacherJeton("jeton-a");
    const b = hacherJeton("jeton-b");
    expect(a).not.toBe(b);
  });
});
