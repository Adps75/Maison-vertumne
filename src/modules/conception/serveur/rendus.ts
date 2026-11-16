import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { creerFournisseurImage } from "../ia";
import { calculerCout } from "../config/style-plantes";
import {
  decoder, decoderMasque, encoderMasquePng, encoderPng,
  rendreDessinIA, rendreRealiste, passesParMateriau, type Editeur,
} from "../rendu/pipeline";
import { consigneRendu, consigneStyle, consignePasse } from "../rendu/styles";
import { couleursPresentes } from "../rendu/carte";
import { couleursCarte, type Materiau } from "../materiaux/materiaux";
import { BUCKET, cheminsRendu, referencesActives, type DemandeGeneration, type LigneRendu } from "./rendus-stockage";

async function telecharger(supabase: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new ErreurRendu(`Fichier introuvable : ${path}`, 400);
  return Buffer.from(await data.arrayBuffer());
}

async function deposer(supabase: SupabaseClient, path: string, buffer: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
}

export class ErreurRendu extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Éditeur branché sur le fournisseur configuré (FOURNISSEUR_IMAGE). */
function editeurFournisseur(): Editeur {
  const fournisseur = creerFournisseurImage();
  return async (consigne, imagePng, { masquePng, taille, references }) => {
    const r = await fournisseur.editer(consigne, imagePng, { masque: masquePng, taille, qualite: "high", references });
    return { buffer: r.buffer, usage: r.usage };
  };
}

/**
 * Génère un rendu à partir des couches déposées par le navigateur, l'enregistre
 * (image, masque, coût réel) et supprime les fichiers d'entrée temporaires.
 */
export async function genererRendu(params: {
  supabase: SupabaseClient;
  projetId: string;
  pdv: { id: string; photo_path: string };
  demande: DemandeGeneration;
}): Promise<LigneRendu> {
  const { supabase, projetId, pdv, demande } = params;
  const { renduId, style } = demande;
  const chemins = cheminsRendu(projetId, renduId);

  const photo = await decoder(await telecharger(supabase, pdv.photo_path));
  const couche = await decoder(await telecharger(supabase, chemins.couche));

  // Références de style communes à l'atelier : les mêmes pour toutes les vues
  const refs = await referencesActives(supabase, style);
  const references = await Promise.all(refs.map((r) => telecharger(supabase, r.path)));

  // Carte des matériaux : légende des seuls matériaux présents (couleurs de la bibliothèque)
  const carteBrute = await supabase.storage.from(BUCKET).download(chemins.carte);
  const carte = carteBrute.data ? await decoder(Buffer.from(await carteBrute.data.arrayBuffer())) : null;
  const { data: lignesMateriaux } = await supabase.from("materiaux").select("*");
  const materiaux = (lignesMateriaux ?? []) as Materiau[];
  const couleurs = couleursCarte(materiaux);
  const presents = carte
    ? couleursPresentes(carte, materiaux.filter((m) => couleurs.has(m.id)).map((m) => ({ m, rgb: couleurs.get(m.id)!.rgb, couleur: couleurs.get(m.id)!.nom })))
    : [];
  const carteEnvoyee = presents.length > 0 ? carte : null;

  const consigne = consigneRendu({
    style,
    nbReferences: references.length,
    annotations: demande.annotations,
    plantesPrincipales: demande.plantesPrincipales,
    materiaux: demande.materiaux,
    carte: presents.map((p) => ({ nom: p.m.nom, couleur: p.couleur, description: p.m.description_ia })),
    consignesSup: demande.consignesSup,
  });

  let resultat;
  if (style === "realiste") {
    const masqueScene = await decoderMasque(await telecharger(supabase, chemins.masqueScene));
    try {
      resultat = await rendreRealiste({ photo, couche, masqueScene, editer: editeurFournisseur(), consigne, references, carte: carteEnvoyee });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Aucun végétal")) throw new ErreurRendu(e.message, 422);
      throw e;
    }
  } else {
    resultat = await rendreDessinIA({ photo, couche, editer: editeurFournisseur(), consigne, references, carte: carteEnvoyee });
  }

  // Option : une passe masquée par matériau présent, limitée à sa zone de la carte
  const usages = resultat.usage ? [resultat.usage] : [];
  let passes = 0;
  if (demande.passesMateriaux && carteEnvoyee) {
    const r = await passesParMateriau({
      image: resultat.image, carte: carteEnvoyee, editer: editeurFournisseur(), references,
      materiaux: presents.map((p) => ({ nom: p.m.nom, description: p.m.description_ia, rgb: p.rgb })),
      consigne: (m) => consignePasse(style, m),
    });
    resultat = { ...resultat, image: r.image };
    usages.push(...r.usages);
    passes = r.usages.length;
  }

  await deposer(supabase, chemins.image, await encoderPng(resultat.image));
  if (resultat.masque) await deposer(supabase, chemins.masque, await encoderMasquePng(resultat.masque));

  const cout = Math.round(usages.reduce((s, u) => s + calculerCout(u), 0) * 10000) / 10000;
  if (carteEnvoyee) await deposer(supabase, chemins.carte, await encoderPng(carteEnvoyee));
  const { data, error } = await supabase
    .from("conception_rendus")
    .insert({
      id: renduId,
      point_de_vue_id: pdv.id,
      style,
      image_path: chemins.image,
      masque_path: resultat.masque ? chemins.masque : null,
      cout,
      // Trace : consigne exacte, partie « style » commune aux vues, références utilisées
      consigne,
      consigne_style: consigneStyle(style, references.length),
      references_utilisees: refs.map((r) => ({ id: r.id, path: r.path })),
      consignes_sup: demande.consignesSup.trim() || null,
      annotations: demande.annotations && style === "croquis",
      carte_path: carteEnvoyee ? chemins.carte : null,
      passes_materiaux: passes,
    })
    .select()
    .single();
  if (error) {
    // Pas de fichiers orphelins si l'enregistrement échoue
    await supabase.storage.from(BUCKET).remove([chemins.image, chemins.masque, chemins.couche, chemins.masqueScene, chemins.carte]);
    throw new Error(error.message);
  }

  // Fichiers d'entrée temporaires ; la carte reste avec le rendu si elle a servi
  await supabase.storage.from(BUCKET).remove([chemins.couche, chemins.masqueScene, ...(carteEnvoyee ? [] : [chemins.carte])]);
  return data as LigneRendu;
}
