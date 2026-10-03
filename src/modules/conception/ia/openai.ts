import "server-only";

import type { FournisseurImage, OptionsGeneration, ResultatGeneration } from "./types";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class FournisseurOpenAI implements FournisseurImage {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare";
    if (!this.apiKey) throw new Error("OPENAI_API_KEY non configuré.");
  }

  async generer(prompt: string, options?: OptionsGeneration): Promise<ResultatGeneration> {
    return this.appelerAvecRetry(async () => {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          background: "transparent",
          output_format: "png",
          size: options?.taille ?? "1024x1024",
          quality: options?.qualite ?? "high",
          n: 1,
        }),
      });

      return this.traiterReponse(res);
    });
  }

  async editer(
    prompt: string,
    imageReference: Buffer,
    options?: OptionsGeneration,
  ): Promise<ResultatGeneration> {
    return this.appelerAvecRetry(async () => {
      const form = new FormData();
      form.append("model", this.model);
      form.append("prompt", prompt);
      form.append("image", new Blob([new Uint8Array(imageReference)], { type: "image/png" }), "reference.png");
      form.append("size", options?.taille ?? "1024x1024");

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });

      return this.traiterReponse(res);
    });
  }

  private async traiterReponse(res: Response): Promise<ResultatGeneration> {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new Erreur429(body);
      }
      throw new Error(`OpenAI erreur ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Pas d'image dans la réponse OpenAI.");

    return {
      buffer: Buffer.from(b64, "base64"),
      usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
    };
  }

  private async appelerAvecRetry(fn: () => Promise<ResultatGeneration>): Promise<ResultatGeneration> {
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof Erreur429 && i < MAX_RETRIES) {
          console.warn(`[openai] Rate limit (429), tentative ${i + 2}/${MAX_RETRIES + 1} dans ${RETRY_DELAYS[i]}ms`);
          await sleep(RETRY_DELAYS[i]);
          continue;
        }
        throw e;
      }
    }
    throw new Error("Échec après toutes les tentatives.");
  }
}

class Erreur429 extends Error {
  constructor(body: string) {
    super(`Rate limit (429): ${body.slice(0, 200)}`);
  }
}
