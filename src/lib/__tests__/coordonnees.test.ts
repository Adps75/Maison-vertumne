import { describe, it, expect } from "vitest";
import { normaliserTelephone, schemaCoordonnees } from "../validation/coordonnees";

describe("normaliserTelephone", () => {
  it("normalise 06 12 34 56 78", () => {
    expect(normaliserTelephone("06 12 34 56 78")).toBe("+33612345678");
  });

  it("normalise 0612345678", () => {
    expect(normaliserTelephone("0612345678")).toBe("+33612345678");
  });

  it("normalise +33 6 12 34 56 78", () => {
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("normalise +33612345678", () => {
    expect(normaliserTelephone("+33612345678")).toBe("+33612345678");
  });

  it("normalise 06.12.34.56.78", () => {
    expect(normaliserTelephone("06.12.34.56.78")).toBe("+33612345678");
  });

  it("normalise 06-12-34-56-78", () => {
    expect(normaliserTelephone("06-12-34-56-78")).toBe("+33612345678");
  });

  it("normalise un fixe 01 42 68 53 00", () => {
    expect(normaliserTelephone("01 42 68 53 00")).toBe("+33142685300");
  });

  it("normalise un fixe 09 72 10 20 30", () => {
    expect(normaliserTelephone("09 72 10 20 30")).toBe("+33972102030");
  });

  it("normalise 0033 6 12 34 56 78", () => {
    expect(normaliserTelephone("0033 6 12 34 56 78")).toBe("+33612345678");
  });
});

describe("schemaCoordonnees", () => {
  const valide = {
    prenom: "Adrien",
    email: "adrien@test.fr",
    telephone: "06 12 34 56 78",
    consentement: true,
  };

  it("accepte des données valides", () => {
    const result = schemaCoordonnees.safeParse(valide);
    expect(result.success).toBe(true);
  });

  it("refuse un prénom vide", () => {
    const result = schemaCoordonnees.safeParse({ ...valide, prenom: "" });
    expect(result.success).toBe(false);
  });

  it("refuse un email invalide", () => {
    const result = schemaCoordonnees.safeParse({ ...valide, email: "pas-un-email" });
    expect(result.success).toBe(false);
  });

  it("refuse un téléphone trop court", () => {
    const result = schemaCoordonnees.safeParse({ ...valide, telephone: "06 12" });
    expect(result.success).toBe(false);
  });

  it("refuse si consentement est false", () => {
    const result = schemaCoordonnees.safeParse({ ...valide, consentement: false });
    expect(result.success).toBe(false);
  });

  it("accepte un numéro fixe", () => {
    const result = schemaCoordonnees.safeParse({ ...valide, telephone: "01 42 68 53 00" });
    expect(result.success).toBe(true);
  });
});
