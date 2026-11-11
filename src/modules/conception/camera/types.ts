/** Métadonnées EXIF extraites de la photo. */
export interface ExifData {
  marque: string | null;
  modele: string | null;
  focale: number | null;
  focale_35mm: number | null;
  date: string | null;
}

/** Paramètres de position et d'orientation de la caméra. */
export interface CameraParams {
  /** Position X en mètres relatifs au projet. */
  x: number;
  /** Position Y en mètres relatifs au projet. */
  y: number;
  /** Hauteur au-dessus du terrain en mètres. */
  hauteur: number;
  /** Cap en degrés (0 = nord, 90 = est, 180 = sud). */
  cap: number;
  /** Inclinaison en degrés (0 = horizontal, positif = vers le haut). */
  inclinaison: number;
  /** Roulis en degrés (0 = droit, positif = penché à droite). */
  roulis: number;
  /** Champ de vision vertical en degrés. */
  fov_v: number;
}

/** Position du soleil pour les ombres. */
export interface SoleilParams {
  /** Azimut en degrés (0 = nord, 180 = sud). */
  azimut: number;
  /** Élévation au-dessus de l'horizon en degrés. */
  elevation: number;
}

/** Point de vue complet (table conception_points_de_vue + URL signée). */
export interface PointDeVue {
  id: string;
  projet_id: string;
  zone_id: string | null;
  nom: string;
  photo_url: string;
  largeur_px: number;
  hauteur_px: number;
  exif: ExifData;
  camera: CameraParams;
  soleil: SoleilParams;
  statut: "a_caler" | "cale";
}
