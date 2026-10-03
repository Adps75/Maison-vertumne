import "server-only";

import type { FournisseurImage } from "./types";

export function creerFournisseurImage(): FournisseurImage {
  const fournisseur = process.env.FOURNISSEUR_IMAGE ?? "openai";

  switch (fournisseur) {
    case "openai": {
      const { FournisseurOpenAI } = require("./openai");
      return new FournisseurOpenAI();
    }
    default:
      throw new Error(`Fournisseur d'image inconnu : ${fournisseur}`);
  }
}
