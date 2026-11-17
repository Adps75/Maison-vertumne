import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const { imageSignee, estFichierAbsent } = await import("../urls-signees");

const client = (reponses: { data: { signedUrl: string } | null; error: { message: string; statusCode?: string } | null }[]) => {
  const createSignedUrl = vi.fn(async () => reponses.shift()!);
  return { sb: { storage: { from: () => ({ createSignedUrl }) } } as unknown as SupabaseClient, createSignedUrl };
};

describe("images des plantes : présence d'après le chemin, pas d'après l'URL signée", () => {
  it("signature réussie : URL et présence", async () => {
    const { sb } = client([{ data: { signedUrl: "https://x/face" }, error: null }]);
    expect(await imageSignee(sb, "plantes/a/face.png")).toEqual({ url: "https://x/face", presente: true });
  });

  it("échec passager : nouvel essai réussi", async () => {
    const { sb, createSignedUrl } = client([{ data: null, error: { message: "fetch failed" } }, { data: { signedUrl: "https://x/f" }, error: null }]);
    expect(await imageSignee(sb, "p.png")).toEqual({ url: "https://x/f", presente: true });
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("deux échecs passagers : image toujours présente (vignette neutre), erreur journalisée", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = client([{ data: null, error: { message: "fetch failed" } }, { data: null, error: { message: "timeout" } }]);
    expect(await imageSignee(sb, "p.png")).toEqual({ url: null, presente: true });
    expect(erreur).toHaveBeenCalledTimes(1);
    erreur.mockRestore();
  });

  it("chemin vide ou fichier réellement absent : image absente", async () => {
    const { sb } = client([{ data: null, error: { message: "Object not found", statusCode: "404" } }]);
    expect(await imageSignee(sb, null)).toEqual({ url: null, presente: false });
    expect(await imageSignee(sb, "p.png")).toEqual({ url: null, presente: false });
    expect(estFichierAbsent({ message: "fetch failed" })).toBe(false);
  });
});
