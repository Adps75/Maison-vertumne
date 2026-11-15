export interface OptionsGeneration {
  taille?: string;
  qualite?: string;
  imageReference?: Buffer; // Pour le style cohérent via l'endpoint d'édition
  /**
   * Masque d'édition : PNG RGBA de même taille que l'image, pixels transparents
   * = zone à modifier. Le modèle s'en sert comme d'un guide (documentation OpenAI).
   */
  masque?: Buffer;
  /**
   * Images de référence de style, envoyées après l'image à éditer (champ image[]
   * répété). Le masque ne s'applique qu'à la première image (documentation OpenAI).
   */
  references?: Buffer[];
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
