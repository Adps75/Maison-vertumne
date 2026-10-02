import type { ActionHistorique } from "../types";

const CAPACITE = 100;

export class Historique {
  private actions: ActionHistorique[] = [];
  private position = -1; // Index de la dernière action appliquée

  push(action: ActionHistorique) {
    // Supprimer les actions après la position courante (branche morte)
    this.actions = this.actions.slice(0, this.position + 1);
    this.actions.push(action);

    // Limiter la capacité
    if (this.actions.length > CAPACITE) {
      this.actions.shift();
    } else {
      this.position++;
    }
  }

  peutAnnuler(): boolean {
    return this.position >= 0;
  }

  peutRetablir(): boolean {
    return this.position < this.actions.length - 1;
  }

  annuler(): ActionHistorique | null {
    if (!this.peutAnnuler()) return null;
    return this.actions[this.position--];
  }

  retablir(): ActionHistorique | null {
    if (!this.peutRetablir()) return null;
    return this.actions[++this.position];
  }

  taille(): number {
    return this.actions.length;
  }

  vider() {
    this.actions = [];
    this.position = -1;
  }
}
