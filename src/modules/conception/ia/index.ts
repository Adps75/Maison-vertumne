import "server-only";

import type { FournisseurImage } from "./types";
import { FournisseurSimule } from "./simule";

export function creerFournisseurImage(): FournisseurImage {
  const fournisseur = process.env.FOURNISSEUR_IMAGE ?? "openai";

  switch (fournisseur) {
    case "openai": {
      const { FournisseurOpenAI } = require("./openai");
      return new FournisseurOpenAI();
    }
    case "simule":
      // Tests uniquement : aucun appel réseau, résultat déterministe
      return new FournisseurSimule();
    default:
      throw new Error(`Fournisseur d'image inconnu : ${fournisseur}`);
  }
}
