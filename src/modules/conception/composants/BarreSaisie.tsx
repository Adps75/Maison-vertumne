"use client";

interface Props {
  saisie: string;
  message: string;
  sauvegarde: "sauvegarde" | "en_cours" | "non_sauvegarde" | "erreur" | "conflit";
}

export function BarreSaisie({ saisie, message, sauvegarde }: Props) {
  const statusLabel = {
    sauvegarde: "Enregistré",
    en_cours: "Enregistrement…",
    non_sauvegarde: "Non enregistré",
    erreur: "Erreur de sauvegarde",
    conflit: "Non enregistré : projet modifié dans un autre onglet. Rechargez la page.",
  };

  const statusColor = {
    sauvegarde: "text-green-600",
    en_cours: "text-stone",
    non_sauvegarde: "text-brass",
    erreur: "text-red-600",
    conflit: "text-red-600 font-medium",
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 bg-white border-t border-hair-light px-4 py-2 flex items-center gap-4 shadow-sm"
      data-testid="barre-saisie"
    >
      <span className="text-[0.78rem] text-stone flex-shrink-0">{message}</span>
      <span
        className="flex-1 px-2 py-1 bg-paper border border-hair-light rounded text-[0.82rem] text-ink font-mono min-h-[1.8rem] flex items-center"
        data-testid="saisie-texte"
      >
        {saisie}
        <span className="animate-pulse ml-px text-brass">|</span>
      </span>
      <span className={`text-[0.72rem] flex-shrink-0 ${statusColor[sauvegarde]}`} data-testid="statut-sauvegarde" data-statut={sauvegarde}>
        {statusLabel[sauvegarde]}
      </span>
    </div>
  );
}
