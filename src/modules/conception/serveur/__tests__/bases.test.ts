import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cleReferences, cheminBase } = await import("../rendus-stockage");

describe("base stylisée : clé des références", () => {
  it("stable quel que soit l'ordre de dépôt ; vide sans référence", () => {
    expect(cleReferences([{ id: "b" }, { id: "a" }])).toBe(cleReferences([{ id: "a" }, { id: "b" }]));
    expect(cleReferences([])).toBe("");
    expect(cheminBase("p1", "b1")).toBe("projets/p1/bases/b1.png");
  });
});
