/**
 * Nettoyage des données de test, à brancher dans un test.afterAll de chaque suite :
 * exécuté même si un test échoue.
 *
 * Ne supprime QUE les projets dont le nom commence par un préfixe de la suite et créés
 * depuis le lancement de la série (marge d'une minute pour les écarts d'horloge), et
 * les plantes reconnues par le filtre fourni. Jamais « le premier projet de la liste ».
 * Suppression par l'API (fichiers de stockage compris).
 *
 * Données oubliées (série interrompue) : npm run nettoyer:e2e.
 */

import fs from "fs";
import { request } from "@playwright/test";

const ETAT_AUTH = "e2e/.auth/state.json";
const MARGE_HORLOGE_MS = 60_000;

interface Options {
  /** Préfixe(s) des noms de projets créés par la suite, ex. « E2E-rendu- ». */
  projets?: string | string[];
  /** Plantes de test créées par la suite. */
  plantes?: (p: { nom_latin: string; nom_commun: string }) => boolean;
}

export function nettoyageApres(options: Options): () => Promise<void> {
  const debut = Date.now() - MARGE_HORLOGE_MS;
  const prefixes = options.projets ? ([] as string[]).concat(options.projets) : [];
  for (const p of prefixes) {
    if (!/^E2E-[A-Za-z0-9-]+-$/.test(p)) throw new Error(`Préfixe de projet de test invalide : ${p}`);
  }

  return async () => {
    if (!fs.existsSync(ETAT_AUTH)) return;
    const ctx = await request.newContext({
      baseURL: `http://localhost:${process.env.PORT ?? "3000"}`,
      storageState: ETAT_AUTH,
    });
    try {
      if (prefixes.length > 0) {
        const r = await ctx.get("/api/conception/projets");
        const projets = ((await r.json()).projets ?? []) as { id: string; nom: string | null; created_at: string }[];
        for (const p of projets) {
          if (!p.nom || !prefixes.some((pre) => p.nom!.startsWith(pre))) continue;
          if (Date.parse(p.created_at) < debut) continue;
          const d = await ctx.delete(`/api/conception/projets/${p.id}`);
          if (!d.ok()) console.warn(`[nettoyage e2e] projet ${p.nom} non supprimé (${d.status()})`);
        }
      }
      if (options.plantes) {
        const r = await ctx.get("/api/conception/plantes");
        const plantes = ((await r.json()).plantes ?? []) as { id: string; nom_latin: string; nom_commun: string }[];
        for (const p of plantes.filter(options.plantes)) {
          const d = await ctx.delete(`/api/conception/plantes/${p.id}`);
          if (!d.ok()) console.warn(`[nettoyage e2e] plante ${p.nom_latin} non supprimée (${d.status()})`);
        }
      }
    } catch (e) {
      console.warn("[nettoyage e2e] échec du nettoyage :", e instanceof Error ? e.message : e);
    } finally {
      await ctx.dispose();
    }
  };
}
