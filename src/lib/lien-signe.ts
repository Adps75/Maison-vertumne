import { createHmac } from "crypto";

const DUREE_JOURS = 30;

function getSecret(): string {
  const secret = process.env.SECRET_LIENS;
  if (!secret) throw new Error("SECRET_LIENS non configuré.");
  return secret;
}

/** Génère un lien signé /diagnostic?l={id}&e={expiration}&s={signature}. */
export function genererLienDiagnostic(leadId: string, baseUrl: string): string {
  const expiration = Math.floor(Date.now() / 1000) + DUREE_JOURS * 24 * 60 * 60;
  const signature = signer(leadId, expiration);
  return `${baseUrl}/diagnostic?l=${leadId}&e=${expiration}&s=${signature}`;
}

/** Vérifie un lien signé. Renvoie le leadId si valide, null sinon. */
export function verifierLienDiagnostic(
  leadId: string,
  expiration: string,
  signature: string,
): string | null {
  const exp = parseInt(expiration, 10);
  if (isNaN(exp)) return null;

  // Expiré ?
  if (Math.floor(Date.now() / 1000) > exp) return null;

  // Signature valide ?
  const attendue = signer(leadId, exp);
  if (signature !== attendue) return null;

  return leadId;
}

function signer(leadId: string, expiration: number): string {
  return createHmac("sha256", getSecret())
    .update(`${leadId}:${expiration}`)
    .digest("hex")
    .slice(0, 32);
}
