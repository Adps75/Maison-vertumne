import "server-only";

interface BrevoParams {
  destinataire: string;
  objet: string;
  html: string;
  pieceJointe?: { nom: string; contenuBase64: string };
}

/**
 * Envoie un email via l'API transactionnelle Brevo.
 * Ne doit être appelé que si EMAIL_MODE === "envoi".
 */
export async function envoyerViaBrevo(params: BrevoParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR ?? "contact@atelierdespres.fr";

  if (!apiKey) throw new Error("BREVO_API_KEY non configuré.");

  const body: Record<string, unknown> = {
    sender: { email: expediteur, name: "Atelier des Prés" },
    to: [{ email: params.destinataire }],
    subject: params.objet,
    htmlContent: params.html,
  };

  if (params.pieceJointe) {
    body.attachment = [
      {
        name: params.pieceJointe.nom,
        content: params.pieceJointe.contenuBase64,
      },
    ];
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo erreur ${res.status}: ${text}`);
  }
}
