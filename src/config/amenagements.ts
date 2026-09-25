export interface Amenagement {
  code: string;
  libelle: string;
}

export interface TrancheSurface {
  code: string;
  libelle: string;
  mediane: number | null;
}

export const AMENAGEMENTS_MAISON: Amenagement[] = [
  { code: "creation_complete", libelle: "Création ou rénovation complète du jardin" },
  { code: "massifs", libelle: "Massifs et plantations" },
  { code: "arbres_haies", libelle: "Arbres et haies" },
  { code: "gazon", libelle: "Gazon" },
  { code: "terrasse_bois", libelle: "Terrasse bois" },
  { code: "terrasse_minerale", libelle: "Terrasse en pierre ou dallage" },
  { code: "allees", libelle: "Allées et bordures" },
  { code: "clotures", libelle: "Clôtures et brise-vue" },
  { code: "arrosage", libelle: "Arrosage automatique" },
  { code: "eclairage", libelle: "Éclairage extérieur" },
];

export const AMENAGEMENTS_APPARTEMENT: Amenagement[] = [
  { code: "bacs_jardinieres", libelle: "Bacs et jardinières" },
  { code: "plantations", libelle: "Plantations" },
  { code: "platelage", libelle: "Sol en bois ou dalles" },
  { code: "brise_vue", libelle: "Brise-vue et pare-vent" },
  { code: "arrosage", libelle: "Arrosage automatique" },
  { code: "eclairage", libelle: "Éclairage" },
];

export const TRANCHES_MAISON: TrancheSurface[] = [
  { code: "moins_20", libelle: "Moins de 20 m²", mediane: 10 },
  { code: "20_50", libelle: "20 à 50 m²", mediane: 35 },
  { code: "50_100", libelle: "50 à 100 m²", mediane: 75 },
  { code: "100_300", libelle: "100 à 300 m²", mediane: 200 },
  { code: "plus_300", libelle: "Plus de 300 m²", mediane: 450 },
  { code: "ne_sait_pas", libelle: "Je ne sais pas", mediane: null },
];

export const TRANCHES_APPARTEMENT: TrancheSurface[] = [
  { code: "moins_5", libelle: "Moins de 5 m²", mediane: 3 },
  { code: "5_10", libelle: "5 à 10 m²", mediane: 7.5 },
  { code: "10_20", libelle: "10 à 20 m²", mediane: 15 },
  { code: "20_50", libelle: "20 à 50 m²", mediane: 35 },
  { code: "plus_50", libelle: "Plus de 50 m²", mediane: 75 },
  { code: "ne_sait_pas", libelle: "Je ne sais pas", mediane: null },
];

export function amenagementsPourLieu(typeLieu: "maison" | "appartement") {
  return typeLieu === "maison" ? AMENAGEMENTS_MAISON : AMENAGEMENTS_APPARTEMENT;
}

export function tranchesPourLieu(typeLieu: "maison" | "appartement") {
  return typeLieu === "maison" ? TRANCHES_MAISON : TRANCHES_APPARTEMENT;
}

export function codesMaison(): string[] {
  return AMENAGEMENTS_MAISON.map((a) => a.code);
}

export function codesAppartement(): string[] {
  return AMENAGEMENTS_APPARTEMENT.map((a) => a.code);
}

export function medianeParCode(
  typeLieu: "maison" | "appartement",
  code: string,
): number | null {
  const tranche = tranchesPourLieu(typeLieu).find((t) => t.code === code);
  return tranche?.mediane ?? null;
}
