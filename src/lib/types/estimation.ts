// --- Types de lieu ---

export type TypeLieu = "maison" | "appartement";

// --- Types spécifiques appartement ---

export type TypeEspace = "balcon" | "terrasse" | "toit_terrasse";
export type TypeAcces = "ascenseur" | "escalier" | "monte_charge" | "exterieur";
export type OrientationEspace =
  | "nord"
  | "nord_est"
  | "est"
  | "sud_est"
  | "sud"
  | "sud_ouest"
  | "ouest"
  | "nord_ouest"
  | "ne_sait_pas";
export type AccordCopro = "obtenu" | "a_demander" | "non_necessaire" | "ne_sait_pas";

// --- Parcelle (maison uniquement) ---

export interface ParcelleInfo {
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  contenance: number;
  section: string;
  numero: string;
  commune: string;
}

// --- Données du parcours ---

export interface DonneesEstimation {
  // Étape 1 — Type de lieu
  typeLieu?: TypeLieu;

  // Étape 2 — Adresse
  adresseLabel?: string;
  lat?: number;
  lon?: number;
  codeInsee?: string;

  // Étape 2 (maison) — Parcelle
  parcelle?: ParcelleInfo;
  surfaceParcelle?: number;

  // Étape 3 — Photos (à venir)
  // Étape 4 — Le projet (à venir)

  // Étape 4 (appartement) — Données spécifiques
  typeEspace?: TypeEspace;
  surfaceEspace?: number;
  etage?: number;
  acces?: TypeAcces;
  orientationEspace?: OrientationEspace;
  accordCopro?: AccordCopro;

  // Étape 5 — Budget et urgence (à venir)
  // Étape 6 — Coordonnées (à venir)
  // Étape 7 — Estimation (à venir)
  // Étape 8 — Récapitulatif (à venir)
}

// --- Nombre d'étapes ---

export const NOMBRE_ETAPES = 8;

/** Nombre d'étapes du parcours selon le type de lieu. */
export function nombreEtapes(typeLieu?: TypeLieu): number {
  // Pour l'instant les deux parcours ont le même nombre d'étapes.
  // Prévu pour diverger si nécessaire.
  return typeLieu === undefined ? NOMBRE_ETAPES : NOMBRE_ETAPES;
}
