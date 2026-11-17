import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reducer, etatInitial, viderChangements, getChangements, reinitialiserHistoriques } from "../reducer";
import { planifierSauvegarde, envoyerImmediatement, aDesModificationsNonEnregistrees, corpsSauvegarde, setUpdatedAt } from "../sauvegarde";
import type { Element } from "../../types";

const el = (id: string, x = 0): Element => ({
  id, type: "sol", geometrie: { type: "polygone", points: [[x, 0], [x + 1, 0], [x + 1, 1]] }, calque: "sols", statut: "nouveau", hauteur: null, proprietes: {}, ordre: 0,
});

describe("sauvegarde différentielle", () => {
  beforeEach(() => { viderChangements(); reinitialiserHistoriques(); setUpdatedAt("2026-01-01T00:00:00Z"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("corps : dernière version de chaque élément, suppressions sans les ré-ajouts", () => {
    const c = corpsSauvegarde([el("a", 0), el("a", 5), el("b")], ["a", "c", "c"], "ref");
    expect(c.upserts.map((e) => [e.id, (e.geometrie as { points: number[][] }).points[0][0]])).toEqual([["a", 5], ["b", 0]]);
    expect(c.suppressions).toEqual(["c"]);
    expect(c.updated_at).toBe("ref");
  });

  it("envoi immédiat (fermeture de l'onglet) : keepalive, sans attendre les 2 s", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, updated_at: "2026-01-02T00:00:00Z" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    reducer(etatInitial(), { type: "CREER_ELEMENT", element: el("a") });
    const statuts: string[] = [];
    planifierSauvegarde("p1", (s) => statuts.push(s));
    expect(fetchMock).not.toHaveBeenCalled();
    await envoyerImmediatement(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(options.keepalive).toBe(true);
    expect(aDesModificationsNonEnregistrees()).toBe(false);
    expect(statuts.at(-1)).toBe("sauvegarde");
    // Le minuteur de 2 s a été annulé : aucun second envoi
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une modification faite pendant l'envoi reste en attente et part ensuite", async () => {
    vi.useFakeTimers();
    let liberer: () => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => {
      liberer = () => r(new Response(JSON.stringify({ ok: true, updated_at: "2026-01-02T00:00:00Z" }), { status: 200 }));
    }));
    vi.stubGlobal("fetch", fetchMock);
    let e = reducer(etatInitial(), { type: "CREER_ELEMENT", element: el("a") });
    planifierSauvegarde("p1", () => {});
    const envoi = envoyerImmediatement(false);
    // Pendant l'envoi : nouvelle modification
    e = reducer(e, { type: "CREER_ELEMENT", element: el("b", 3) });
    liberer();
    await envoi;
    expect(getChangements().upserts.map((x) => x.id)).toEqual(["b"]);
    expect(aDesModificationsNonEnregistrees()).toBe(true);
  });

  it("rien à enregistrer : aucun envoi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await envoyerImmediatement(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
