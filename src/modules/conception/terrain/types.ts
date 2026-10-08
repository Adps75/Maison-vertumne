/** Grille d'altitudes IGN stockée pour un projet. */
export interface GrilleRelief {
  /** Coin sud-ouest de la grille, en mètres relatifs au projet. */
  origine: [number, number];
  /** Pas de la grille en mètres. */
  pas: number;
  /** Nombre de colonnes (axe X / est). */
  colonnes: number;
  /** Nombre de lignes (axe Y / nord). */
  lignes: number;
  /** Altitudes NGF en row-major (ligne 0 = sud). */
  altitudes: number[];
}

/** Point coté relevé par le paysagiste. */
export interface PointCote {
  x: number;
  y: number;
  /** Altitude relative à la référence du projet, en mètres. */
  altitudeRelative: number;
}

/** Courbe de niveau pour l'affichage 2D. */
export interface CourbeDeNiveau {
  /** Altitude relative à la référence. */
  altitude: number;
  /** Segments de la courbe en coordonnées plan. */
  points: [number, number][];
}
