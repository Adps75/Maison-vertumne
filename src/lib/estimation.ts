import type {
  Tarif,
  ParametresEstimation,
  ProjetEstimation,
  ResultatEstimation,
  DetailPrestation,
} from "./types/tarifs";
import { amenagementsPourLieu } from "@/config/amenagements";

/**
 * Calcule la fourchette de prix à partir du projet, des tarifs et des paramètres.
 * Fonction pure, sans accès réseau ni base de données.
 */
export function calculerFourchette(
  projet: ProjetEstimation,
  tarifs: Tarif[],
  params: ParametresEstimation,
): ResultatEstimation {
  const { type_lieu, types_amenagement, etage, acces } = projet;
  const surfaceDefaut = params.surface_defaut[type_lieu];
  const surfaceInconnue = projet.surface === null;
  const surface = projet.surface ?? surfaceDefaut;

  // Index des tarifs
  const tarifMap = new Map<string, Tarif>();
  for (const t of tarifs) {
    tarifMap.set(t.type_amenagement, t);
  }

  // Libellés
  const libelleMap = new Map<string, string>();
  for (const a of amenagementsPourLieu(type_lieu)) {
    libelleMap.set(a.code, a.libelle);
  }

  // Calculer les parts et normaliser si > 100%
  const prestationsPart = types_amenagement
    .map((code) => ({ code, tarif: tarifMap.get(code) }))
    .filter((p) => p.tarif?.mode === "part") as { code: string; tarif: Tarif }[];

  const sommeParts = prestationsPart.reduce(
    (s, p) => s + (p.tarif.part_defaut ?? 0),
    0,
  );
  const facteurNormalisation = sommeParts > 1 ? 1 / sommeParts : 1;

  // Calculer chaque prestation
  const detail: DetailPrestation[] = [];
  let totalMin = 0;
  let totalMax = 0;

  for (const code of types_amenagement) {
    const tarif = tarifMap.get(code);
    if (!tarif) continue;

    let prestMin: number;
    let prestMax: number;

    if (tarif.mode === "part") {
      const part = (tarif.part_defaut ?? 0) * facteurNormalisation;
      const surfacePart = surface * part;
      prestMin = tarif.prix_m2_min * surfacePart;
      prestMax = tarif.prix_m2_max * surfacePart;
    } else {
      // global
      prestMin = tarif.prix_m2_min * surface;
      prestMax = tarif.prix_m2_max * surface;
    }

    // Forfait minimum
    prestMin = Math.max(prestMin, tarif.forfait_minimum);
    prestMax = Math.max(prestMax, tarif.forfait_minimum);

    totalMin += prestMin;
    totalMax += prestMax;

    detail.push({
      code,
      libelle: libelleMap.get(code) ?? code,
      min: prestMin,
      max: prestMax,
    });
  }

  // Dégressivité
  const deg = params.degressivite;
  if (surface < deg.seuil_bas) {
    totalMin *= deg.coeff_bas;
    totalMax *= deg.coeff_bas;
  } else if (surface > deg.seuil_haut) {
    totalMin *= deg.coeff_haut;
    totalMax *= deg.coeff_haut;
  }

  // Coefficient logistique (appartement uniquement)
  if (type_lieu === "appartement" && etage != null && acces) {
    const coeff = calculerCoeffLogistique(etage, acces, params.coeff_logistique);
    totalMin *= coeff;
    totalMax *= coeff;
  }

  // Élargissement si surface inconnue
  if (surfaceInconnue) {
    totalMin *= params.surface_defaut.elargissement_min;
    totalMax *= params.surface_defaut.elargissement_max;
  }

  return {
    min: arrondir(totalMin),
    max: arrondir(totalMax),
    detail,
  };
}

function calculerCoeffLogistique(
  etage: number,
  acces: string,
  params: ParametresEstimation["coeff_logistique"],
): number {
  if (etage <= params.etage_sans_supplement) return 1.0;

  switch (acces) {
    case "ascenseur":
      return params.ascenseur;
    case "escalier": {
      const etagesSup = Math.max(0, etage - params.etage_sans_supplement);
      const coeff =
        params.escalier_base + etagesSup * params.escalier_par_etage_sup;
      return Math.min(coeff, params.escalier_plafond);
    }
    case "monte_charge":
      return params.monte_charge;
    case "exterieur":
      return params.exterieur;
    default:
      return 1.0;
  }
}

/** Arrondi à la centaine sous 5 000 €, au millier au-dessus. */
function arrondir(montant: number): number {
  if (montant < 5000) {
    return Math.round(montant / 100) * 100;
  }
  return Math.round(montant / 1000) * 1000;
}
