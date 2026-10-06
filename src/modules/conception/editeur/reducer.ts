import type {
  EtatEditeur,
  Element,
  NomOutil,
  Calque,
  PlanteSelectionnee,
  ActionHistorique,
  Geometrie,
  ChangementsEnAttente,
} from "../types";
import type { Pt } from "../geo/plan";
import { Historique } from "./historique";

// ===================== Actions =====================

export type Action =
  | { type: "CHANGER_OUTIL"; outil: NomOutil; message?: string }
  | { type: "AJOUTER_POINT"; point: Pt }
  | { type: "TERMINER_TRACE"; fermer?: boolean }
  | { type: "ANNULER_TRACE" }
  | { type: "CREER_ELEMENT"; element: Element }
  | { type: "MODIFIER_ELEMENTS"; elements: Element[] }
  | { type: "SUPPRIMER_SELECTION" }
  | { type: "SELECTIONNER"; ids: string[]; ajouter?: boolean }
  | { type: "DESELECTIONNER" }
  | { type: "ANNULER" }
  | { type: "RETABLIR" }
  | { type: "TOGGLE_ACCROCHAGE" }
  | { type: "TOGGLE_ORTHO" }
  | { type: "CALQUE_VISIBILITE"; nom: string }
  | { type: "CALQUE_VERROUILLAGE"; nom: string }
  | { type: "CALQUE_ACTIF"; nom: string }
  | { type: "CALQUE_COULEUR"; nom: string; couleur: string }
  | { type: "OPACITE_ORTHO"; opacite: number }
  | { type: "SAISIE"; texte: string }
  | { type: "CHARGER_ELEMENTS"; elements: Element[] }
  | { type: "MARQUER_SAUVEGARDE" }
  | { type: "CHANGER_PLANTE"; plante: PlanteSelectionnee };

// ===================== État initial =====================

export const CALQUES_DEFAUT: Calque[] = [
  { nom: "existant", visible: true, verrouille: false, couleur: "#E8E050" },    // Jaune vif
  { nom: "sols", visible: true, verrouille: false, couleur: "#E07830" },         // Orange
  { nom: "mineral", visible: true, verrouille: false, couleur: "#50B8E0" },      // Bleu clair
  { nom: "vegetal", visible: true, verrouille: false, couleur: "#40D870" },       // Vert vif
  { nom: "cotes", visible: true, verrouille: false, couleur: "#FF4040" },         // Rouge vif
  { nom: "annotations", visible: true, verrouille: false, couleur: "#F0C040" },   // Or
];

export function etatInitial(): EtatEditeur {
  return {
    outil: "selection",
    planteSelectionnee: null,
    elements: new Map(),
    selection: new Set(),
    traceEnCours: [],
    accrochageActif: true,
    modeOrtho: false,
    calques: [...CALQUES_DEFAUT],
    calqueActif: "vegetal",
    opaciteOrtho: 0.7,
    saisie: "",
    messageCommande: "Prêt",
  };
}

// ===================== Historique (singleton partagé via closure) =====================

const historique = new Historique();

// Suivi des changements pour la sauvegarde différentielle
let changements: ChangementsEnAttente = { upserts: [], suppressions: [] };

export function getChangements(): ChangementsEnAttente {
  return changements;
}

export function viderChangements() {
  changements = { upserts: [], suppressions: [] };
}

export function getHistorique(): Historique {
  return historique;
}

// ===================== Reducer =====================

export function reducer(etat: EtatEditeur, action: Action): EtatEditeur {
  switch (action.type) {
    case "CHANGER_OUTIL":
      return {
        ...etat,
        outil: action.outil,
        traceEnCours: [],
        selection: new Set(),
        saisie: "",
        messageCommande: action.message ?? messageOutil(action.outil),
      };

    case "AJOUTER_POINT":
      return {
        ...etat,
        traceEnCours: [...etat.traceEnCours, action.point],
        saisie: "",
      };

    case "TERMINER_TRACE":
      return { ...etat, traceEnCours: [], saisie: "" };

    case "ANNULER_TRACE":
      return {
        ...etat,
        traceEnCours: [],
        outil: "selection",
        saisie: "",
        messageCommande: "Prêt",
      };

    case "CREER_ELEMENT": {
      const elements = new Map(etat.elements);
      elements.set(action.element.id, action.element);

      historique.push({
        type: "creer",
        avant: [],
        apres: [action.element],
        suppressions: [],
      });

      changements.upserts.push(action.element);

      return { ...etat, elements, traceEnCours: [] };
    }

    case "MODIFIER_ELEMENTS": {
      const elements = new Map(etat.elements);
      const avant: Element[] = [];

      for (const el of action.elements) {
        const existant = elements.get(el.id);
        if (existant) avant.push(existant);
        elements.set(el.id, el);
        changements.upserts.push(el);
      }

      historique.push({
        type: "modifier",
        avant,
        apres: action.elements,
        suppressions: [],
      });

      return { ...etat, elements };
    }

    case "SUPPRIMER_SELECTION": {
      if (etat.selection.size === 0) return etat;

      const elements = new Map(etat.elements);
      const avant: Element[] = [];
      const ids: string[] = [];

      for (const id of etat.selection) {
        const el = elements.get(id);
        if (el) {
          avant.push(el);
          ids.push(id);
          elements.delete(id);
        }
      }

      historique.push({ type: "supprimer", avant, apres: [], suppressions: ids });
      changements.suppressions.push(...ids);

      return { ...etat, elements, selection: new Set() };
    }

    case "SELECTIONNER": {
      const selection = action.ajouter ? new Set(etat.selection) : new Set<string>();
      for (const id of action.ids) selection.add(id);
      return { ...etat, selection };
    }

    case "DESELECTIONNER":
      return { ...etat, selection: new Set() };

    case "ANNULER": {
      const action_hist = historique.annuler();
      if (!action_hist) return etat;

      const elements = new Map(etat.elements);

      // Annuler les suppressions
      for (const el of action_hist.avant) {
        elements.set(el.id, el);
        changements.upserts.push(el);
      }

      // Annuler les créations
      for (const el of action_hist.apres) {
        if (action_hist.type === "creer") {
          elements.delete(el.id);
          changements.suppressions.push(el.id);
        }
      }

      // Annuler les modifications
      if (action_hist.type === "modifier") {
        for (const el of action_hist.apres) elements.delete(el.id);
        for (const el of action_hist.avant) {
          elements.set(el.id, el);
          changements.upserts.push(el);
        }
      }

      // Annuler les suppressions
      if (action_hist.type === "supprimer") {
        for (const id of action_hist.suppressions) {
          // Retirer des suppressions en attente
          changements.suppressions = changements.suppressions.filter((s) => s !== id);
        }
      }

      return { ...etat, elements };
    }

    case "RETABLIR": {
      const action_hist = historique.retablir();
      if (!action_hist) return etat;

      const elements = new Map(etat.elements);

      for (const el of action_hist.apres) {
        elements.set(el.id, el);
        changements.upserts.push(el);
      }

      for (const id of action_hist.suppressions) {
        elements.delete(id);
        changements.suppressions.push(id);
      }

      return { ...etat, elements };
    }

    case "TOGGLE_ACCROCHAGE":
      return { ...etat, accrochageActif: !etat.accrochageActif };

    case "TOGGLE_ORTHO":
      return { ...etat, modeOrtho: !etat.modeOrtho };

    case "CALQUE_VISIBILITE": {
      const calques = etat.calques.map((c) =>
        c.nom === action.nom ? { ...c, visible: !c.visible } : c,
      );
      return { ...etat, calques };
    }

    case "CALQUE_VERROUILLAGE": {
      const calques = etat.calques.map((c) =>
        c.nom === action.nom ? { ...c, verrouille: !c.verrouille } : c,
      );
      return { ...etat, calques };
    }

    case "CALQUE_ACTIF":
      return { ...etat, calqueActif: action.nom };

    case "CALQUE_COULEUR": {
      const calques = etat.calques.map((c) =>
        c.nom === action.nom ? { ...c, couleur: action.couleur } : c,
      );
      return { ...etat, calques };
    }

    case "OPACITE_ORTHO":
      return { ...etat, opaciteOrtho: action.opacite };

    case "SAISIE":
      return { ...etat, saisie: action.texte };

    case "CHARGER_ELEMENTS": {
      const elements = new Map<string, Element>();
      for (const el of action.elements) elements.set(el.id, el);
      return { ...etat, elements };
    }

    case "MARQUER_SAUVEGARDE":
      return etat;

    case "CHANGER_PLANTE":
      return {
        ...etat,
        outil: "planter",
        planteSelectionnee: action.plante,
        traceEnCours: [],
        messageCommande: `PLA : cliquez pour poser ${action.plante.nom_commun}, Échap pour terminer`,
      };

    default:
      return etat;
  }
}

function messageOutil(outil: NomOutil): string {
  const messages: Record<NomOutil, string> = {
    selection: "Prêt",
    polyligne: "PL : cliquez le premier point, Entrée pour terminer, C pour fermer",
    polygone: "PL : cliquez le premier point, C ou clic sur le départ pour fermer",
    rectangle: "REC : cliquez le premier coin",
    cercle: "C : cliquez le centre",
    arc: "A : cliquez le premier point (3 points)",
    cote: "DI : cliquez le premier point",
    texte: "T : cliquez pour placer le texte",
    deplacer: "M : sélectionnez puis cliquez le point de base",
    copier: "CO : sélectionnez puis cliquez le point de base",
    rotation: "RO : sélectionnez puis cliquez le centre de rotation",
    miroir: "MI : sélectionnez puis cliquez le premier point de l'axe",
    mesurer: "Cliquez deux points pour mesurer",
    planter: "PLA : sélectionnez une plante dans le panneau Végétaux",
  };
  return messages[outil] ?? "Prêt";
}
