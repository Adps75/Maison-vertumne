export interface OptionsGeneration {
  taille?: string;
  qualite?: string;
  imageReference?: Buffer; // Pour le style cohérent via l'endpoint d'édition
  /**
   * Masque d'édition : PNG RGBA de même taille que l'image, pixels transparents
   * = zone à modifier. Le modèle s'en sert comme d'un guide (documentation OpenAI).
   */
  masque?: Buffer;
}

export interface ResultatGeneration {
  buffer: Buffer;
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
}

export interface FournisseurImage {
  generer(prompt: string, options?: OptionsGeneration): Promise<ResultatGeneration>;
  editer(prompt: string, imageReference: Buffer, options?: OptionsGeneration): Promise<ResultatGeneration>;
}
