import type { Pt } from "./geo/plan";

// ===================== Géométrie stockée =====================

export type TypeGeometrie = "polyligne" | "polygone" | "rectangle" | "cercle" | "arc" | "point";

export interface GeometriePolyligne {
  type: "polyligne";
  points: Pt[];
}

export interface GeometriePolygone {
  type: "polygone";
  points: Pt[];
}

export interface GeometrieRectangle {
  type: "rectangle";
  points: Pt[]; // 4 sommets
}

export interface GeometrieCercle {
  type: "cercle";
  centre: Pt;
  rayon: number;
}

export interface GeometrieArc {
  type: "arc";
  centre: Pt;
  rayon: number;
  angleDebut: number; // degrés, sens trigo
  angleFin: number;
}

export interface GeometriePoint {
  type: "point";
  position: Pt;
}

export interface GeometrieCote {
  type: "cote";
  p1: Pt;       // Premier point mesuré
  p2: Pt;       // Deuxième point mesuré
  decalage: number; // Distance de la ligne de cote par rapport au segment, en mètres
  distance: number; // Distance mesurée en mètres
}

export type Geometrie =
  | GeometriePolyligne
  | GeometriePolygone
  | GeometrieRectangle
  | GeometrieCercle
  | GeometrieArc
  | GeometrieCote
  | GeometriePoint;

// ===================== Élément =====================

export type TypeElement = "sol" | "mineral" | "vegetal" | "bati" | "limite" | "cote" | "annotation" | "zone";
export type StatutElement = "existant" | "conserve" | "nouveau" | "supprime";

export interface Element {
  id: string;
  type: TypeElement;
  geometrie: Geometrie;
  calque: string;
  statut: StatutElement;
  hauteur: number | null;
  proprietes: Record<string, unknown>;
  ordre: number;
}

// ===================== Calque =====================

export interface Calque {
  nom: string;
  visible: boolean;
  verrouille: boolean;
  couleur: string;
}

// ===================== Outils =====================

export type NomOutil =
  | "selection"
  | "polyligne"
  | "polygone"
  | "rectangle"
  | "cercle"
  | "arc"
  | "cote"
  | "texte"
  | "deplacer"
  | "copier"
  | "rotation"
  | "miroir"
  | "mesurer"
  | "zone_rectangle"
  | "zone_polygone";

// ===================== Accrochage =====================

export type TypeAccrochage = "extremite" | "milieu" | "surSegment" | "intersection" | "centre";

export interface Accrochage {
  point: Pt;
  type: TypeAccrochage;
}

// ===================== Historique =====================

export interface ActionHistorique {
  type: string;
  avant: Element[];
  apres: Element[];
  suppressions: string[];
}

// ===================== Sauvegarde =====================

export interface ChangementsEnAttente {
  upserts: Element[];
  suppressions: string[];
}

// ===================== Étapes du projet =====================

export type NumeroEtape = 1 | 2 | 3 | 4 | 5 | 6;

export const ETAPES_LABELS: Record<NumeroEtape, string> = {
  1: "Adresse",
  2: "Zones",
  3: "Calques",
  4: "Végétaux",
  5: "Photos & 3D",
  6: "Rendus",
};

/** Étapes déjà construites (accessibles). */
export const ETAPES_ACTIVES: Set<NumeroEtape> = new Set([1, 2, 4]);

// ===================== État éditeur =====================

export interface EtatEditeur {
  outil: NomOutil;
  etape: NumeroEtape;
  zoneActive: string | null;
  elements: Map<string, Element>;
  selection: Set<string>;
  traceEnCours: Pt[];
  accrochageActif: boolean;
  modeOrtho: boolean;
  calques: Calque[];
  calqueActif: string;
  opaciteOrtho: number;
  saisie: string;
  messageCommande: string;
}
