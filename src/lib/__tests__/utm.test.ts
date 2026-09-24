import { describe, it, expect } from "vitest";
import { extraireUtm } from "../utm";

describe("extraireUtm", () => {
  it("renvoie null si aucun paramètre UTM", () => {
    const url = new URL("https://example.com/page");
    expect(extraireUtm(url)).toBeNull();
  });

  it("extrait les paramètres UTM présents", () => {
    const url = new URL(
      "https://example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=jardins",
    );
    expect(extraireUtm(url)).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "jardins",
      page_arrivee: "/landing",
    });
  });

  it("inclut la page d'arrivée", () => {
    const url = new URL("https://example.com/promo?utm_source=meta");
    const result = extraireUtm(url);
    expect(result?.page_arrivee).toBe("/promo");
  });

  it("ignore les paramètres non-UTM", () => {
    const url = new URL("https://example.com/?utm_source=fb&foo=bar");
    const result = extraireUtm(url);
    expect(result).toEqual({
      utm_source: "fb",
      page_arrivee: "/",
    });
    expect(result).not.toHaveProperty("foo");
  });

  it("extrait utm_content quand il est présent", () => {
    const url = new URL(
      "https://example.com/?utm_source=google&utm_content=variante-a",
    );
    expect(extraireUtm(url)).toEqual({
      utm_source: "google",
      utm_content: "variante-a",
      page_arrivee: "/",
    });
  });
});
