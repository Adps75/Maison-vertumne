export interface OptionsGeneration {
  taille?: string;
  qualite?: string;
  imageReference?: Buffer; // Pour le style cohérent via l'endpoint d'édition
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
