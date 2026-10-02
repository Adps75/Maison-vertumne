import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { schemaAnalyseIA, type AnalyseIA } from "./validation/analyse";
import {
  construirePromptSysteme,
  construireMessageUtilisateur,
  construireOutilAnalyse,
} from "./analyse-prompt";
import { preparerImagesAeriennes, lirePhotosClient } from "./analyse-images";
import { calculerScore, type ResultatScore } from "./score";
import { genererPdfPrediagnostic } from "./pdf/prediagnostic";
import { genererLienDiagnostic } from "./lien-signe";
import { envoyerEmail } from "./email/envoyer";
import { emailClient, emailRepli, emailAdmin } from "./email/templates";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIMEOUT_EN_COURS_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES_API = 2;
const RETRY_DELAYS_MS = [2000, 5000];

/** Calcule une empreinte du dossier pour détecter les modifications. */
function empreinteDossier(lead: Record<string, unknown>): string {
  const cles = [
    "type_lieu", "types_amenagement", "surface_projet", "tranche_surface",
    "description", "budget_declare", "urgence", "fourchette_min", "fourchette_max",
  ];
  const data = cles.map((k) => `${k}:${JSON.stringify(lead[k])}`).join("|");
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/** Lance l'analyse IA d'un lead. Idempotente et résistante aux pannes. */
export async function lancerAnalyse(leadId: string): Promise<void> {
  const supabase = await createClient();

  // Charger le lead complet
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    console.error("[analyse] Lead introuvable:", leadId);
    return;
  }

  const empreinte = empreinteDossier(lead);
  const maintenant = new Date().toISOString();

  // Prise en charge atomique
  const { data: updated, error: updateErr } = await supabase
    .from("leads")
    .update({
      analyse_statut: "en_cours",
      analyse_debut: maintenant,
      analyse_erreur: null,
    })
    .eq("id", leadId)
    .or(
      `analyse_statut.eq.en_attente,` +
      `analyse_statut.eq.erreur,` +
      `analyse_empreinte.neq.${empreinte},` +
      `and(analyse_statut.eq.en_cours,analyse_debut.lt.${new Date(Date.now() - TIMEOUT_EN_COURS_MS).toISOString()})`,
    )
    .select("id")
    .single();

  if (updateErr || !updated) {
    // Analyse déjà en cours ou terminée avec la même empreinte
    return;
  }

  try {
    const resultat = await executerAnalyse(supabase, lead);

    // Calculer le score
    const { data: photos } = await supabase
      .from("photos")
      .select("id")
      .eq("lead_id", leadId);

    const score = calculerScore(
      {
        fourchette_max: lead.fourchette_max,
        lat: lead.lat,
        lon: lead.lon,
        proprietaire: lead.proprietaire,
        urgence: lead.urgence,
        budget_declare: lead.budget_declare,
        fourchette_min: lead.fourchette_min,
        rappel_souhaite: lead.rappel_souhaite,
        description: lead.description,
        types_amenagement: lead.types_amenagement,
        nb_photos: photos?.length ?? 0,
      },
      resultat.analyse,
    );

    // Enregistrer tout
    await supabase
      .from("leads")
      .update({
        analyse_ia: { ...resultat.analyse, score_detail: score.detail },
        analyse_statut: "terminee",
        analyse_date: new Date().toISOString(),
        analyse_modele: resultat.modele,
        analyse_usage: resultat.usage,
        analyse_empreinte: empreinte,
        analyse_erreur: null,
        score_valeur: score.interet,
        score_chaleur: score.fiabilite,
        score_total: score.total,
        categorie: score.categorie,
      })
      .eq("id", leadId);

    // Générer le PDF et envoyer les emails (un échec ici ne change pas le statut de l'analyse)
    try {
      await envoyerPrediagnostic(supabase, leadId, lead, resultat.analyse, score);
    } catch (emailErr) {
      console.error("[analyse] Erreur envoi pré-diagnostic:", emailErr);
      await supabase
        .from("leads")
        .update({ prediagnostic_erreur: emailErr instanceof Error ? emailErr.message : "Erreur inconnue" })
        .eq("id", leadId);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("[analyse] Erreur finale:", message);

    // Email de repli (fourchette seule)
    try {
      await envoyerEmailRepli(supabase, leadId, lead);
    } catch (repliErr) {
      console.error("[analyse] Erreur email de repli:", repliErr);
    }

    await supabase
      .from("leads")
      .update({
        analyse_statut: "erreur",
        analyse_erreur: message,
      })
      .eq("id", leadId);
  }
}

async function executerAnalyse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: Record<string, unknown>,
): Promise<{
  analyse: AnalyseIA;
  modele: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const anthropic = new Anthropic();
  const modele = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

  const typeLieu = lead.type_lieu as string;
  const isMaison = typeLieu === "maison";

  // Charger les photos
  const { data: photosDb } = await supabase
    .from("photos")
    .select("path, ordre, lat, lon, orientation_degres, legende")
    .eq("lead_id", lead.id)
    .order("ordre");

  const photosInfo = photosDb ?? [];

  // Préparer les images
  const imagesContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (isMaison && lead.parcelle_geojson) {
    const { aerienneAnnotee, infrarouge } = await preparerImagesAeriennes(
      supabase,
      lead.id as string,
      lead.parcelle_geojson as GeoJSON.MultiPolygon,
      photosInfo,
    );

    imagesContent.push(
      {
        type: "text",
        text: "Image aérienne annotée (contour de la parcelle en laiton, marqueurs numérotés et flèches de direction des photos) :",
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: aerienneAnnotee.toString("base64"),
        },
      },
      {
        type: "text",
        text: "Image en infrarouge fausses couleurs : la végétation vivante et vigoureuse apparaît en rouge vif, la végétation sèche ou peu active en tons ternes ou rosés, les surfaces minérales en gris, bleu ou blanc. Utilise-la uniquement pour évaluer l'état de la végétation.",
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: infrarouge.toString("base64"),
        },
      },
    );
  }

  // Photos client
  const photosClient = await lirePhotosClient(
    supabase,
    photosInfo.map((p) => p.path),
  );

  for (const photo of photosClient) {
    const info = photosInfo[photo.ordre - 1];
    const label = info?.legende
      ? `Photo n°${photo.ordre} — ${info.legende}`
      : `Photo n°${photo.ordre}`;

    imagesContent.push(
      { type: "text", text: `${label} :` },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: photo.base64,
        },
      },
    );
  }

  // Message texte
  const messageTexte = construireMessageUtilisateur({
    type_lieu: typeLieu,
    surface_parcelle: lead.surface_parcelle as number | null,
    tranche_surface: lead.tranche_surface as string | null,
    types_amenagement: (lead.types_amenagement as string[]) ?? [],
    description: (lead.description as string) ?? "",
    budget_declare: (lead.budget_declare as string) ?? "",
    urgence: (lead.urgence as string) ?? "",
    fourchette_min: (lead.fourchette_min as number) ?? 0,
    fourchette_max: (lead.fourchette_max as number) ?? 0,
    photos: photosInfo.map((p) => ({
      ordre: p.ordre,
      lat: p.lat,
      lon: p.lon,
      orientation_degres: p.orientation_degres,
      legende: p.legende,
    })),
  });

  const outil = construireOutilAnalyse();

  // Appel API avec retry
  let dernierErreur: Error | null = null;

  for (let tentative = 0; tentative <= MAX_RETRIES_API; tentative++) {
    try {
      const response = await anthropic.messages.create({
        model: modele,
        max_tokens: 4096,
        system: construirePromptSysteme(),
        tools: [outil],
        tool_choice: { type: "tool", name: "analyse_dossier" },
        messages: [
          {
            role: "user",
            content: [
              ...imagesContent,
              { type: "text", text: messageTexte },
            ],
          },
        ],
      });

      // Extraire le résultat de l'outil
      const toolBlock = response.content.find(
        (b) => b.type === "tool_use" && b.name === "analyse_dossier",
      );

      if (!toolBlock || toolBlock.type !== "tool_use") {
        throw new Error("L'IA n'a pas utilisé l'outil analyse_dossier.");
      }

      // Valider avec Zod
      const parsed = schemaAnalyseIA.safeParse(toolBlock.input);
      if (!parsed.success) {
        // Retry sur échec de validation (une seule fois)
        if (tentative < MAX_RETRIES_API) {
          dernierErreur = new Error(
            `Validation Zod échouée: ${parsed.error.message}`,
          );
          await sleep(RETRY_DELAYS_MS[tentative] ?? 2000);
          continue;
        }
        throw new Error(
          `Validation Zod échouée après ${tentative + 1} tentatives: ${parsed.error.message}`,
        );
      }

      return {
        analyse: parsed.data,
        modele,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (e) {
      dernierErreur = e instanceof Error ? e : new Error(String(e));

      // Retry sur erreur de surcharge ou limite de débit
      const isRetryable =
        dernierErreur.message.includes("overloaded") ||
        dernierErreur.message.includes("rate_limit") ||
        dernierErreur.message.includes("529") ||
        dernierErreur.message.includes("429");

      if (isRetryable && tentative < MAX_RETRIES_API) {
        await sleep(RETRY_DELAYS_MS[tentative] ?? 2000);
        continue;
      }

      if (tentative === MAX_RETRIES_API) break;
    }
  }

  throw dernierErreur ?? new Error("Échec de l'analyse après toutes les tentatives.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===================== ENVOI PRÉ-DIAGNOSTIC =====================

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://atelierdespres.fr";

async function envoyerPrediagnostic(
  supabase: SupabaseClient,
  leadId: string,
  lead: Record<string, unknown>,
  analyse: AnalyseIA,
  score: ResultatScore,
): Promise<void> {
  const lienDiagnostic = genererLienDiagnostic(leadId, BASE_URL);

  // Signed URLs pour les photos (pour le PDF)
  const { data: photosDb } = await supabase
    .from("photos")
    .select("ordre, path")
    .eq("lead_id", leadId)
    .order("ordre");

  const photosUrls: { ordre: number; url: string }[] = [];
  for (const p of photosDb ?? []) {
    const { data } = await supabase.storage
      .from("photos-jardins")
      .createSignedUrl(p.path, 3600);
    if (data?.signedUrl) {
      photosUrls.push({ ordre: p.ordre, url: data.signedUrl });
    }
  }

  // URL de l'image aérienne annotée
  let aerienneUrl: string | undefined;
  const aeriennePath = `leads/${leadId}/aerienne-annotee.jpg`;
  const { data: aerienneData } = await supabase.storage
    .from("documents-leads")
    .createSignedUrl(aeriennePath, 3600);
  if (aerienneData?.signedUrl) aerienneUrl = aerienneData.signedUrl;

  // Générer le PDF
  const pdfBuffer = await genererPdfPrediagnostic({
    prenom: (lead.prenom as string) ?? "",
    date: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    observations: analyse.observations,
    fourchette_min: (lead.fourchette_min as number) ?? 0,
    fourchette_max: (lead.fourchette_max as number) ?? 0,
    aerienneUrl,
    photosUrls,
    lienDiagnostic,
  });

  // Stocker le PDF dans Storage
  const pdfPath = `leads/${leadId}/prediagnostic.pdf`;
  await supabase.storage
    .from("documents-leads")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  await supabase
    .from("leads")
    .update({ prediagnostic_path: pdfPath })
    .eq("id", leadId);

  // Email client
  const emailClientData = emailClient((lead.prenom as string) ?? "", lienDiagnostic);
  await envoyerEmail({
    supabase,
    leadId,
    type: "client_prediagnostic",
    destinataire: (lead.email as string) ?? "",
    objet: emailClientData.objet,
    html: emailClientData.html,
    pieceJointe: { nom: "prediagnostic.pdf", contenuBase64: pdfBuffer.toString("base64") },
    pathPieceJointe: pdfPath,
  });

  // Email admin
  const adminEmail = process.env.EMAIL_ADMIN;
  if (adminEmail) {
    const scoreDetail = score.detail as Record<string, number>;
    const emailAdminData = emailAdmin({
      prenom: (lead.prenom as string) ?? "",
      commune: (lead.adresse_label as string)?.split(",").pop()?.trim() ?? "",
      fourchette: `${(lead.fourchette_min as number)?.toLocaleString("fr-FR") ?? "?"} – ${(lead.fourchette_max as number)?.toLocaleString("fr-FR") ?? "?"} €`,
      categorie: score.categorie,
      scoreTotal: score.total,
      scoreDetail,
      synthese: analyse.observations.synthese_demande,
      pointsVigilance: analyse.fiche_interne.points_vigilance,
      questionsAppel: analyse.fiche_interne.questions_appel,
      email: (lead.email as string) ?? "",
      telephone: (lead.telephone as string) ?? "",
      lienFiche: `${BASE_URL}/dev/leads/${leadId}`,
    });

    await envoyerEmail({
      supabase,
      leadId,
      type: "admin_nouveau_lead",
      destinataire: adminEmail,
      objet: emailAdminData.objet,
      html: emailAdminData.html,
    });
  }
}

async function envoyerEmailRepli(
  supabase: SupabaseClient,
  leadId: string,
  lead: Record<string, unknown>,
): Promise<void> {
  const lienDiagnostic = genererLienDiagnostic(leadId, BASE_URL);
  const data = emailRepli(
    (lead.prenom as string) ?? "",
    (lead.fourchette_min as number) ?? 0,
    (lead.fourchette_max as number) ?? 0,
    lienDiagnostic,
  );

  await envoyerEmail({
    supabase,
    leadId,
    type: "client_repli",
    destinataire: (lead.email as string) ?? "",
    objet: data.objet,
    html: data.html,
  });
}
