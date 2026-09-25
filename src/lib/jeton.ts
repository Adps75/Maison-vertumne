import "server-only";

import { randomBytes, createHash } from "crypto";

/** Génère un jeton aléatoire de 32 octets en hexadécimal (64 caractères). */
export function genererJeton(): string {
  return randomBytes(32).toString("hex");
}

/** Calcule l'empreinte SHA-256 d'un jeton, en hexadécimal. */
export function hacherJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}
