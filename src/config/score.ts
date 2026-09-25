export const SCORE_CONFIG = {
  fiabilite: {
    // sur 60
    proprietaire: { oui: 15, non: 0 },
    delai: {
      moins_3_mois: 15,
      "3_6_mois": 10,
      "6_12_mois": 5,
      plus_12_mois: 0,
    } as Record<string, number>,
    budget_coherent: 15,
    budget_ne_sait_pas: 7,
    budget_incoherent: 0,
    engagement: 10,
    dossier_complet: {
      min_photos: 4,
      min_description: 100,
      points: 5,
    },
  },
  interet: {
    // sur 40
    montant: [
      { seuil: 2000, points: 2 },
      { seuil: 5000, points: 5 },
      { seuil: 15000, points: 8 },
      { seuil: Infinity, points: 10 },
    ],
    distance: {
      proche: { seuil_km: 7, points: 10 },
      moyen: { seuil_km: 10, points: 5 },
      loin: 0,
    },
    projet_clair: {
      perimetre_confiance: 5,
      estimation_coherente: 5,
    },
    potentiel: {
      gamme_elevee: 5,
      perimetre_plus_large_ou_extension: 5,
    },
  },
  categories: {
    A: 70,
    B: 50,
    C: 30,
    // D : en dessous de C
  },
} as const;
