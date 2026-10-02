import { describe, it, expect } from "vitest";
import { Historique } from "../historique";

function action(id: string) {
  return { type: id, avant: [], apres: [], suppressions: [] };
}

describe("Historique", () => {
  it("push et annuler", () => {
    const h = new Historique();
    h.push(action("a1"));
    h.push(action("a2"));
    expect(h.taille()).toBe(2);

    const annule = h.annuler();
    expect(annule?.type).toBe("a2");
    expect(h.peutAnnuler()).toBe(true);

    const annule2 = h.annuler();
    expect(annule2?.type).toBe("a1");
    expect(h.peutAnnuler()).toBe(false);
  });

  it("rétablir après annuler", () => {
    const h = new Historique();
    h.push(action("a1"));
    h.push(action("a2"));
    h.annuler();

    expect(h.peutRetablir()).toBe(true);
    const retabli = h.retablir();
    expect(retabli?.type).toBe("a2");
  });

  it("push après annuler supprime la branche morte", () => {
    const h = new Historique();
    h.push(action("a1"));
    h.push(action("a2"));
    h.annuler();
    h.push(action("a3"));

    expect(h.taille()).toBe(2); // a1, a3
    expect(h.peutRetablir()).toBe(false);
  });

  it("capacité limitée à 100", () => {
    const h = new Historique();
    for (let i = 0; i < 120; i++) {
      h.push(action(`a${i}`));
    }
    expect(h.taille()).toBe(100);
  });

  it("annuler sans historique renvoie null", () => {
    const h = new Historique();
    expect(h.annuler()).toBeNull();
    expect(h.peutAnnuler()).toBe(false);
  });

  it("vider", () => {
    const h = new Historique();
    h.push(action("a1"));
    h.vider();
    expect(h.taille()).toBe(0);
    expect(h.peutAnnuler()).toBe(false);
  });
});
