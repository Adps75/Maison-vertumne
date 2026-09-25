export interface Tarif {
  type_amenagement: string;
  prix_m2_min: number;
  prix_m2_max: number;
  mode: "part" | "global";
  part_defaut: number | null;
  forfait_minimum: number;
}

export interface Degressivite {
  seuil_bas: number;
  coeff_bas: number;
  seuil_haut: number;
  coeff_haut: number;
}

export interface CoeffLogistique {
  etage_sans_supplement: number;
  ascenseur: number;
  escalier_base: number;
  escalier_par_etage_sup: number;
  escalier_plafond: number;
  monte_charge: number;
  exterieur: number;
}

export interface SurfaceDefaut {
  maison: number;
  appartement: number;
  elargissement_min: number;
  elargissement_max: number;
}

export interface ParametresEstimation {
  degressivite: Degressivite;
  coeff_logistique: CoeffLogistique;
  surface_defaut: SurfaceDefaut;
}

export interface DetailPrestation {
  code: string;
  libelle: string;
  min: number;
  max: number;
}

export interface ResultatEstimation {
  min: number;
  max: number;
  detail: DetailPrestation[];
}

export interface ProjetEstimation {
  type_lieu: "maison" | "appartement";
  types_amenagement: string[];
  surface: number | null;
  etage?: number;
  acces?: string;
}
