import { describe, it, expect } from "vitest";
import { projetsUtilisantPlante, messagePlanteUtilisee } from "../utilisation";

const PROJETS = [{ id: "p1", nom: "Leclerc" }, { id: "p2", nom: "Arnaud" }, { id: "p3", nom: null }];

describe("utilisation d'une plante", () => {
  it("projets où la plante est posée sur le plan ou dans une composition, sans doublon, triés", () => {
    const r = projetsUtilisantPlante("ff68", {
      elements: [{ projet_id: "p1" }, { projet_id: "p1" }],
      compositions: [
        { projet_id: "p2", palette: { retenues: [{ plante_id: "ff68" }] }, intention: null },
        { projet_id: "p3", palette: null, intention: { plantes: [{ plante_id: "ff68" }] } },
        { projet_id: "p1", palette: { retenues: [{ plante_id: "autre" }] }, intention: null },
      ],
      projets: PROJETS,
    });
    expect(r).toEqual([{ id: "p2", nom: "Arnaud" }, { id: "p1", nom: "Leclerc" }, { id: "p3", nom: "Projet sans nom" }]);
  });

  it("plante inutilisée : aucun projet", () => {
    expect(projetsUtilisantPlante("x", { elements: [], compositions: [{ projet_id: "p1", palette: {}, intention: {} }], projets: PROJETS })).toEqual([]);
  });

  it("message clair avec les projets concernés", () => {
    expect(messagePlanteUtilisee([{ id: "p1", nom: "Leclerc" }])).toBe("Cette plante est utilisée dans le projet « Leclerc ». Retirez-la de ce projet avant de la supprimer.");
    expect(messagePlanteUtilisee([{ id: "p1", nom: "A" }, { id: "p2", nom: "B" }])).toContain("2 projets : « A », « B »");
  });
});
