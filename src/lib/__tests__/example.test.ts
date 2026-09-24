import { describe, it, expect } from "vitest";

function additionner(a: number, b: number): number {
  return a + b;
}

describe("exemple", () => {
  it("additionne deux nombres", () => {
    expect(additionner(2, 3)).toBe(5);
  });
});
