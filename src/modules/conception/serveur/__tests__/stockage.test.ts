import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dossierAutorise, listerFichiers, supprimerDossier } from "../stockage";

const ID = "6fed5a2d-905e-447c-ad26-5f93f85735c8";

/** Faux stockage : arborescence en mémoire, suppressions enregistrées. */
function fauxStockage(arbre: Record<string, string[]>) {
  const supprimes: string[] = [];
  const client = {
    storage: {
      from: () => ({
        list: async (dossier: string) => {
          const enfants = arbre[dossier] ?? [];
          return { data: enfants.map((n) => ({ name: n.replace(/\/$/, ""), id: n.endsWith("/") ? null : `id-${n}` })), error: null };
        },
        remove: async (chemins: string[]) => { supprimes.push(...chemins); return { data: [], error: null }; },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, supprimes };
}

describe("stockage : suppression d'un dossier de projet ou de plante", () => {
  it("n'accepte que projets/<uuid> et plantes/<uuid>", () => {
    expect(dossierAutorise(`projets/${ID}`)).toBe(true);
    expect(dossierAutorise(`plantes/${ID}`)).toBe(true);
    for (const refuse of ["projets", "projets/", "plantes", "", "/", `projets/${ID}/rendus`, `autre/${ID}`, "projets/abc", `projets/${ID}/..`]) {
      expect(dossierAutorise(refuse)).toBe(false);
    }
  });

  it("refuse un dossier non autorisé sans rien lire ni supprimer", async () => {
    const { client, supprimes } = fauxStockage({ projets: ["a.jpg"] });
    await expect(supprimerDossier(client, "projets")).rejects.toThrow(/refusé/);
    expect(supprimes).toEqual([]);
  });

  it("liste et supprime récursivement (photos, rendus, relief)", async () => {
    const d = `projets/${ID}`;
    const { client, supprimes } = fauxStockage({
      [d]: ["relief.json", "points-de-vue/", "rendus/"],
      [`${d}/points-de-vue`]: ["v1.jpg", "v2.jpg"],
      [`${d}/rendus`]: ["r1/"],
      [`${d}/rendus/r1`]: ["image.png", "masque.png"],
    });
    expect((await listerFichiers(client, d)).sort()).toEqual([
      `${d}/points-de-vue/v1.jpg`, `${d}/points-de-vue/v2.jpg`, `${d}/relief.json`,
      `${d}/rendus/r1/image.png`, `${d}/rendus/r1/masque.png`,
    ]);
    expect(await supprimerDossier(client, d)).toBe(5);
    expect(supprimes.length).toBe(5);
    expect(supprimes.every((c) => c.startsWith(`${d}/`))).toBe(true);
  });
});
