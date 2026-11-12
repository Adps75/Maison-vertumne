#!/usr/bin/env node
/**
 * Nettoyage des données de test de bout en bout (développement uniquement).
 *
 * Liste les projets dont le nom commence par « E2E- » et les plantes de test
 * (nom latin contenant « 'E2E »), puis les supprime avec leurs fichiers de stockage
 * après confirmation explicite.
 *
 *   npm run nettoyer:e2e            liste puis demande confirmation
 *   npm run nettoyer:e2e -- --liste liste seulement, ne supprime rien
 *   npm run nettoyer:e2e -- --ids a,b,c
 *                                   limite la suppression à ces identifiants exacts
 *                                   (refus si l'un d'eux n'est pas une donnée de test)
 *
 * Identifiants Supabase lus dans .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
 */

import { createInterface } from "node:readline/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("nettoyer:e2e est réservé au développement (NODE_ENV=production ou Vercel détecté).");
  process.exit(1);
}

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SECRET_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquant dans .env.local.");
  process.exit(1);
}

const supabase = createClient(url, cle, { auth: { persistSession: false } });
const BUCKET = "conception";
const DOSSIER_AUTORISE = /^(projets|plantes)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Liste récursivement les fichiers d'un dossier projets/<uuid> ou plantes/<uuid>. */
async function listerFichiers(dossier) {
  if (!DOSSIER_AUTORISE.test(dossier)) throw new Error(`Dossier refusé : ${dossier}`);
  const fichiers = [];
  const aParcourir = [dossier];
  while (aParcourir.length > 0) {
    const courant = aParcourir.pop();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(BUCKET).list(courant, { limit: 1000, offset });
      if (error) throw new Error(`Lecture du stockage impossible (${courant}) : ${error.message}`);
      if (!data || data.length === 0) break;
      for (const e of data) {
        const chemin = `${courant}/${e.name}`;
        if (e.id === null) aParcourir.push(chemin);
        else fichiers.push(chemin);
      }
      if (data.length < 1000) break;
    }
  }
  return fichiers;
}

async function supprimerFichiers(chemins) {
  for (let i = 0; i < chemins.length; i += 1000) {
    const { error } = await supabase.storage.from(BUCKET).remove(chemins.slice(i, i + 1000));
    if (error) throw new Error(`Suppression du stockage impossible : ${error.message}`);
  }
}

const { data: projets, error: e1 } = await supabase
  .from("conception_projets").select("id, nom, ortho_path, created_at").like("nom", "E2E-%").order("created_at");
const { data: plantes, error: e2 } = await supabase
  .from("plantes").select("id, nom_latin, created_at").ilike("nom_latin", "%'E2E %").order("created_at");
if (e1 || e2) {
  console.error("Lecture impossible :", (e1 ?? e2).message);
  process.exit(1);
}

// --ids : restreindre aux identifiants donnés, qui doivent tous être des données de test
const iArg = process.argv.indexOf("--ids");
if (iArg !== -1) {
  const ids = new Set((process.argv[iArg + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  const connus = new Set([...projets, ...plantes].map((x) => x.id));
  const inconnus = [...ids].filter((id) => !connus.has(id));
  if (ids.size === 0 || inconnus.length > 0) {
    console.error(`Identifiants refusés (absents ou pas des données de test) : ${inconnus.join(", ") || "(aucun identifiant)"}`);
    process.exit(1);
  }
  projets.splice(0, projets.length, ...projets.filter((p) => ids.has(p.id)));
  plantes.splice(0, plantes.length, ...plantes.filter((p) => ids.has(p.id)));
}

console.log(`Projets de test (${projets.length}) :`);
for (const p of projets) console.log(`  ${p.id}  ${p.nom}`);
console.log(`Plantes de test (${plantes.length}) :`);
for (const p of plantes) console.log(`  ${p.id}  ${p.nom_latin}`);

if (projets.length + plantes.length === 0) {
  console.log("Rien à nettoyer.");
  process.exit(0);
}
if (process.argv.includes("--liste")) process.exit(0);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const reponse = (await rl.question(`Supprimer ces ${projets.length + plantes.length} éléments et leurs fichiers ? Tapez « oui » pour confirmer : `)).trim().toLowerCase();
rl.close();
if (reponse !== "oui") {
  console.log("Annulé, rien n'a été supprimé.");
  process.exit(0);
}

let fichiersSupprimes = 0;
for (const p of projets) {
  const fichiers = await listerFichiers(`projets/${p.id}`);
  if (p.ortho_path) fichiers.push(p.ortho_path);
  await supprimerFichiers(fichiers);
  fichiersSupprimes += fichiers.length;
  const { error } = await supabase.from("conception_projets").delete().eq("id", p.id);
  if (error) throw new Error(`Projet ${p.nom} : ${error.message}`);
  console.log(`Supprimé : projet ${p.nom} (${fichiers.length} fichier(s))`);
}
for (const p of plantes) {
  const fichiers = await listerFichiers(`plantes/${p.id}`);
  await supprimerFichiers(fichiers);
  fichiersSupprimes += fichiers.length;
  const { error } = await supabase.from("plantes").delete().eq("id", p.id);
  if (error) throw new Error(`Plante ${p.nom_latin} : ${error.message}`);
  console.log(`Supprimée : plante ${p.nom_latin} (${fichiers.length} fichier(s))`);
}
console.log(`Terminé : ${projets.length} projet(s), ${plantes.length} plante(s), ${fichiersSupprimes} fichier(s).`);
