import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { creerFournisseurImage } from "../ia";
import { calculerCout } from "../config/style-plantes";
import {
  decoder, decoderMasque, encoderMasquePng, encoderPng,
  rendreRealiste, rendreSurBase, genererBase, passesParMateriau, type Editeur, type UsageModele,
} from "../rendu/pipeline";
import { consigneRendu, consigneStyle, consignePasse, consigneBase, consigneEditionBase, type StyleProjet } from "../rendu/styles";
import type { ImageRGBA } from "../rendu/image";
import { couleursPresentes } from "../rendu/carte";
import { couleursCarte, type Materiau } from "../materiaux/materiaux";
import {
  BUCKET, cheminsRendu, cheminBase, cleReferences, referencesActives,
  type DemandeGeneration, type LigneRendu, type ReferenceStyle,
} from "./rendus-stockage";

async function telecharger(supabase: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new ErreurRendu(`Fichier introuvable : ${path}`, 400);
  return Buffer.from(await data.arrayBuffer());
}

async function deposer(supabase: SupabaseClient, path: string, buffer: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
}

async function telechargerSiPresent(supabase: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

export interface BaseStylisee {
  id: string;
  image: ImageRGBA;
  /** Consommation de la génération (null : base réutilisée, aucun appel). */
  usage: UsageModele | null;
}

/**
 * Base stylisée d'une vue pour (style, références) : réutilisée si elle existe, sinon (ou
 * si `refaire`) générée à partir de la photo seule et enregistrée.
 */
export async function obtenirBase(p: {
  supabase: SupabaseClient;
  projetId: string;
  pdv: { id: string; photo_path: string };
  style: Exclude<StyleProjet, "realiste">;
  refs: ReferenceStyle[];
  references: Buffer[];
  photo?: ImageRGBA;
  refaire?: boolean;
}): Promise<BaseStylisee> {
  const { supabase, pdv, style } = p;
  const cle = cleReferences(p.refs);
  const { data: existante } = await supabase.from("conception_bases_stylisees").select("id, image_path")
    .eq("point_de_vue_id", pdv.id).eq("style", style).eq("cle_references", cle).maybeSingle();
  if (existante && !p.refaire) {
    const buf = await telechargerSiPresent(supabase, existante.image_path);
    if (buf) return { id: existante.id, image: await decoder(buf), usage: null };
  }
  const photo = p.photo ?? await decoder(await telecharger(supabase, pdv.photo_path));
  const consigne = consigneBase(style, p.references.length);
  const r = await genererBase({ photo, editer: editeurFournisseur(), consigne, references: p.references });
  const id = crypto.randomUUID();
  const path = cheminBase(p.projetId, id);
  await deposer(supabase, path, await encoderPng(r.image));
  // Une seule base par (vue, style, références) : l'ancienne est remplacée
  if (existante) {
    await supabase.from("conception_bases_stylisees").delete().eq("id", existante.id);
    await supabase.storage.from(BUCKET).remove([existante.image_path]);
  }
  const { error } = await supabase.from("conception_bases_stylisees").insert({
    id, point_de_vue_id: pdv.id, style, cle_references: cle, image_path: path, consigne, cout: calculerCout(r.usage),
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Enregistrement de la base impossible : ${error.message}`);
  }
  return { id, image: r.image, usage: r.usage };
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

  // Emprise de l'existant (volumes et disques au sol) : exclue du masque, tous styles
  const existant = await telechargerSiPresent(supabase, chemins.existant).then((b) => (b ? decoderMasque(b) : null));
  // Carte des matériaux : jamais envoyée au modèle, elle ne sert qu'aux masques par matériau
  const carteBuf = await telechargerSiPresent(supabase, chemins.carte);
  const carte = carteBuf ? await decoder(carteBuf) : null;
  const { data: lignesMateriaux } = await supabase.from("materiaux").select("*");
  const materiaux = (lignesMateriaux ?? []) as Materiau[];
  const couleurs = couleursCarte(materiaux);
  const presents = carte
    ? couleursPresentes(carte, materiaux.filter((m) => couleurs.has(m.id)).map((m) => ({ m, rgb: couleurs.get(m.id)!.rgb })))
    : [];

  const usages: UsageModele[] = [];
  let resultat;
  let consigne: string;
  let baseId: string | null = null;
  try {
    if (style === "realiste") {
      consigne = consigneRendu({
        style, nbReferences: references.length, annotations: false, plantesPrincipales: [],
        materiaux: demande.materiaux, consignesSup: demande.consignesSup,
      });
      const masqueScene = await decoderMasque(await telecharger(supabase, chemins.masqueScene));
      resultat = await rendreRealiste({ photo, couche, masqueScene, existant, editer: editeurFournisseur(), consigne, references });
    } else {
      // 1. Base stylisée (photo seule), réutilisée pour (vue, style, références)
      const base = await obtenirBase({ supabase, projetId, pdv, style, refs, references, photo, refaire: demande.refaireBase });
      baseId = base.id;
      if (base.usage) usages.push(base.usage);
      // 2. Projet ajouté par édition masquée sur la base
      consigne = consigneEditionBase({
        style, nbReferences: references.length, annotations: demande.annotations,
        plantesPrincipales: demande.plantesPrincipales, materiaux: demande.materiaux, consignesSup: demande.consignesSup,
      });
      resultat = await rendreSurBase({ base: base.image, couche, existant, editer: editeurFournisseur(), consigne, references });
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Aucun végétal")) throw new ErreurRendu(e.message, 422);
    throw e;
  }
  if (resultat.usage) usages.push(resultat.usage);

  // Option : une passe masquée par matériau présent, limitée à sa zone de la carte
  let passes = 0;
  if (demande.passesMateriaux && carte && presents.length > 0) {
    const r = await passesParMateriau({
      image: resultat.image, carte, editer: editeurFournisseur(), references,
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
      carte_path: carte ? chemins.carte : null,
      passes_materiaux: passes,
      base_id: baseId,
    })
    .select()
    .single();
  if (error) {
    // Pas de fichiers orphelins si l'enregistrement échoue
    await supabase.storage.from(BUCKET).remove([chemins.image, chemins.masque, chemins.couche, chemins.masqueScene, chemins.carte, chemins.existant]);
    throw new Error(error.message);
  }

  // Fichiers d'entrée temporaires ; la carte reste avec le rendu (vérification)
  await supabase.storage.from(BUCKET).remove([chemins.couche, chemins.masqueScene, chemins.existant]);
  return data as LigneRendu;
}
