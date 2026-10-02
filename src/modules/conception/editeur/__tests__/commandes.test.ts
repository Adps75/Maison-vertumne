import { describe, it, expect } from "vitest";
import { parseSaisie, COMMANDES } from "../commandes";

describe("parseSaisie", () => {
  const base: [number, number] = [5, 5];
  const curseur: [number, number] = [15, 5]; // Direction est

  it("longueur seule dans la direction du curseur", () => {
    const r = parseSaisie("4.5", base, curseur);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("longueur");
    expect(r!.point[0]).toBeCloseTo(9.5);
    expect(r!.point[1]).toBeCloseTo(5);
  });

  it("longueur avec angle : 4.5<30", () => {
    const r = parseSaisie("4.5<30", base, curseur);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("longueur");
    // 4.5 à 30° depuis la base
    const dx = 4.5 * Math.cos((30 * Math.PI) / 180);
    const dy = 4.5 * Math.sin((30 * Math.PI) / 180);
    expect(r!.point[0]).toBeCloseTo(5 + dx);
    expect(r!.point[1]).toBeCloseTo(5 + dy);
  });

  it("C ferme la polyligne", () => {
    const r = parseSaisie("C", base, curseur);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("fermer");
  });

  it("commande connue → type commande", () => {
    const r = parseSaisie("PL", base, curseur);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("commande");
  });

  it("texte invalide → null", () => {
    expect(parseSaisie("abc", base, curseur)).toBeNull();
  });

  it("toutes les commandes AutoCAD sont définies", () => {
    expect(COMMANDES.PL).toBe("polyligne");
    expect(COMMANDES.REC).toBe("rectangle");
    expect(COMMANDES.C).toBe("cercle");
    expect(COMMANDES.A).toBe("arc");
    expect(COMMANDES.DI).toBe("cote");
    expect(COMMANDES.T).toBe("texte");
    expect(COMMANDES.M).toBe("deplacer");
    expect(COMMANDES.CO).toBe("copier");
    expect(COMMANDES.RO).toBe("rotation");
    expect(COMMANDES.MI).toBe("miroir");
  });
});
