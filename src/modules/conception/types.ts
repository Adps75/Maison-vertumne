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

export type Geometrie =
  | GeometriePolyligne
  | GeometriePolygone
  | GeometrieRectangle
  | GeometrieCercle
  | GeometrieArc
  | GeometriePoint;

// ===================== Élément =====================

export type TypeElement = "sol" | "mineral" | "vegetal" | "bati" | "limite" | "cote" | "annotation";
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
  | "mesurer";

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

// ===================== État éditeur =====================

export interface EtatEditeur {
  outil: NomOutil;
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
