// Contenu de la page d'accueil — Atelier des Prés
// Ce fichier sera migré vers la table landing_pages.

export interface ServiceBloc {
  titre: string;
  texte: string;
}

export interface Etape {
  numero: number;
  titre: string;
  texte: string;
}

export interface Engagement {
  titre: string;
  texte: string;
}

export interface Realisation {
  commune: string;
  type: string;
  photoAvant?: string;
  photoApres?: string;
}

export interface Avis {
  prenom: string;
  commune: string;
  note: number;
  texte: string;
}

export interface FaqItem {
  question: string;
  reponse: string;
}

export const accueil = {
  seo: {
    titre: "Paysagiste au Plessis-Robinson et sud parisien | Atelier des Prés",
    description:
      "Conception et aménagement de jardins, terrasses et espaces extérieurs en Île-de-France. Estimation gratuite en 3 minutes.",
  },

  hero: {
    surtitre: "Paysagiste · Le Plessis-Robinson et sud parisien",
    titre: "Conception et aménagement de jardins",
    sousTitreAccent:
      "Des jardins beaux aujourd'hui, et plus encore dans dix ans.",
    sousTitre:
      "De l'esquisse à la dernière plantation, livrés à la date promise.",
    bouton: "Estimer mon projet gratuitement",
    sousBouton:
      "Une fourchette de budget en 3 minutes, sans engagement.",
    preuves: [
      "10 ans de métier",
      "Garantie de reprise des végétaux 1 an",
      "Date de livraison engagée par écrit",
    ],
  },

  pourQui: {
    titre:
      "Votre jardin mérite mieux qu'un chantier approximatif.",
    texte:
      "Vous avez une maison, un extérieur qui ne vous ressemble pas encore, et l'envie d'un résultat soigné, sans avoir à suivre le chantier à la place de l'entreprise. Une terrasse, un massif ou un jardin entier : chaque projet reçoit la même exigence.",
  },

  services: {
    titre: "Ce que nous faisons",
    blocs: [
      {
        titre: "Concevoir",
        texte:
          "Plan, palette végétale, matériaux : vous voyez votre jardin avant le premier coup de pelle.",
      },
      {
        titre: "Planter",
        texte:
          "Arbres, haies, massifs et gazon choisis pour votre sol, votre exposition et des étés de plus en plus chauds. Arrosage automatique économe en eau.",
      },
      {
        titre: "Aménager",
        texte:
          "Terrasses bois et minérales, allées, clôtures, brise-vue et éclairage.",
      },
    ] satisfies ServiceBloc[],
  },

  processus: {
    titre: "Comment ça se passe",
    etapes: [
      {
        numero: 1,
        titre: "Estimation en ligne, gratuite",
        texte:
          "Votre adresse, quelques photos, votre envie : vous recevez une fourchette de budget et un pré-diagnostic de votre jardin.",
      },
      {
        numero: 2,
        titre: "Diagnostic sur place, 190 €",
        texte:
          "Visite, analyse du sol et de l'exposition, premières orientations, esquisse et devis. Déduit si vous poursuivez.",
      },
      {
        numero: 3,
        titre: "Conception, de 900 à 2 500 €",
        texte:
          "Plan, palette végétale, matériaux, vues 3D et chiffrage définitif. Déduite si le chantier est signé dans les 30 jours.",
      },
      {
        numero: 4,
        titre: "Réalisation",
        texte:
          "Dates de début et de fin engagées par écrit, compte rendu photo à chaque étape, réception du chantier et suivi à 1 mois et à 1 an.",
      },
    ] satisfies Etape[],
  },

  engagements: {
    titre: "Nos engagements",
    liste: [
      {
        titre: "L'esthétique",
        texte:
          "Un dessin soigné et des finitions nettes, que vous validez en images avant le chantier.",
      },
      {
        titre: "La durée",
        texte:
          "Des matériaux et des végétaux choisis pour tenir. Un végétal ne reprend pas dans l'année ? Nous le remplaçons.",
      },
      {
        titre: "L'adaptation",
        texte:
          "Chaque plante est choisie pour votre sol, votre exposition et le climat qui change.",
      },
      {
        titre: "La parole tenue",
        texte: "La date annoncée est la date livrée.",
      },
    ] satisfies Engagement[],
  },

  realisations: {
    titre: "Nos réalisations",
    liste: [] as Realisation[],
  },

  fondateur: {
    titre: "Adrien Déprès, fondateur de Atelier des Prés",
    texte:
      "Dix ans de métier, dont six à la tête de ma propre entreprise de paysage, deux en association, un an en Australie et un an au service d'autres entreprises du secteur. J'ai fondé Atelier des Prés pour mettre cette expérience et mon amour du végétal au service de mes clients, et de la végétalisation de nos villes, devenue essentielle face au réchauffement climatique.",
  },

  avis: {
    titre: "Ils nous ont confié leur jardin",
    liste: [] as Avis[],
  },

  faq: {
    titre: "Questions fréquentes",
    items: [
      {
        question: "Combien coûte l'aménagement d'un jardin ?",
        reponse:
          "Tout dépend de la surface, des matériaux et de l'état existant. L'estimation en ligne vous donne une première fourchette en 3 minutes ; le diagnostic l'affine sur place.",
      },
      {
        question: "Intervenez-vous pour les petits projets ?",
        reponse:
          "Oui. Un massif, une haie ou une terrasse reçoivent le même soin qu'un jardin complet.",
      },
      {
        question: "Pourquoi le diagnostic est-il payant ?",
        reponse:
          "Parce qu'il s'agit d'un vrai travail d'analyse et de conseil, que vous gardez quoi qu'il arrive. Il est déduit si vous poursuivez avec nous.",
      },
      {
        question: "Quels sont les délais ?",
        reponse:
          "Ils dépendent de la saison et de l'ampleur du projet. La date de démarrage est fixée au devis, et tenue.",
      },
      {
        question: "Où intervenez-vous ?",
        reponse:
          "Au Plessis-Robinson et dans un rayon d'environ 10 km : sud des Hauts-de-Seine et nord de l'Essonne.",
      },
      {
        question: "Assurez-vous l'entretien ensuite ?",
        reponse:
          "Nous vous remettons des conseils d'entretien écrits à la réception, et assurons le suivi à 1 mois et à 1 an.",
      },
    ] satisfies FaqItem[],
  },

  appelFinal: {
    titre: "Parlons de votre jardin.",
    bouton: "Estimer mon projet gratuitement",
  },
} as const;
