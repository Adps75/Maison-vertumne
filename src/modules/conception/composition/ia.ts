import "server-only";

/**
 * Composition IA — appels à l'API Anthropic (palette, puis intention).
 *
 * Sortie structurée native (output_config.format) générée depuis le schéma Zod,
 * puis revalidée par ce même schéma avant tout enregistrement. Pas d'outil forcé :
 * tool_choice « tool » / « any » renvoie une erreur 400 sur les modèles actuels.
 * Modèle lu dans ANTHROPIC_MODEL_COMPOSITION. COMPOSITION_IA=simule : réponses
 * déterministes, aucun appel réseau (tests).
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  schemaPalette, schemaIntention, LIBELLES_STYLES,
  type Brief, type Contexte, type Palette, type Intention,
} from "./schemas";
import { coutAnthropic, nettoyerPalette, type PlanteBibliotheque } from "./controles";

export type { PlanteBibliotheque } from "./controles";

// ─── Bibliothèque transmise à l'IA ─────────────────────────────────────

export interface ResultatIA<T> {
  donnees: T;
  modele: string;
  cout: number;
}

export class ErreurComposition extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// ─── Modèle, options, coût ─────────────────────────────────────────────

export function modeleComposition(): string {
  const m = process.env.ANTHROPIC_MODEL_COMPOSITION?.trim();
  if (!m) throw new ErreurComposition("ANTHROPIC_MODEL_COMPOSITION n'est pas configuré.", 500);
  return m;
}

/** Modèles récents : réflexion adaptative et niveau d'effort. */
const MODELES_RECENTS = /^claude-(fable-5|mythos-5|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-6)/;
/** Modèles acceptant le repli serveur en cas de refus (fallbacks: "default"). */
const MODELES_AVEC_REPLI = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

// ─── Appel générique ───────────────────────────────────────────────────

async function appelerStructure<S extends z.ZodType>(schema: S, systeme: string, message: string): Promise<ResultatIA<z.infer<S>>> {
  const modele = modeleComposition();
  const client = new Anthropic();
  const recent = MODELES_RECENTS.test(modele);
  const repli = MODELES_AVEC_REPLI.has(modele);

  const stream = client.beta.messages.stream({
    model: modele,
    max_tokens: 32000,
    system: systeme,
    messages: [{ role: "user", content: message }],
    output_config: {
      format: betaZodOutputFormat(schema),
      ...(recent ? { effort: "high" as const } : {}),
    },
    ...(recent ? { thinking: { type: "adaptive" as const } } : {}),
    ...(repli ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });

  let reponse;
  try {
    reponse = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErreurComposition("Trop de demandes à l'IA, réessayez dans une minute.", 429);
    if (e instanceof Anthropic.APIError) throw new ErreurComposition(`Erreur de l'API Anthropic (${e.status}) : ${e.message}`, 502);
    throw e;
  }

  const cout = coutAnthropic(reponse.model ?? modele, reponse.usage);
  if (reponse.stop_reason === "refusal") {
    throw new ErreurComposition("L'IA a refusé de répondre à cette demande. Reformulez le brief et réessayez.", 422);
  }
  if (reponse.stop_reason === "max_tokens") {
    throw new ErreurComposition("Réponse de l'IA tronquée (limite de longueur atteinte).", 502);
  }
  // Revalidation par le schéma Zod avant tout enregistrement
  const verifie = schema.safeParse(reponse.parsed_output);
  if (!verifie.success) {
    throw new ErreurComposition(`Réponse de l'IA invalide : ${verifie.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}`, 502);
  }
  return { donnees: verifie.data, modele: reponse.model ?? modele, cout };
}

// ─── Consignes ─────────────────────────────────────────────────────────

const SYSTEME_PALETTE = `Tu es paysagiste concepteur pour un atelier d'Île-de-France qui crée des jardins esthétiques, faits pour durer, adaptés à leur sol et leur climat.
Tu composes la palette végétale d'un massif à partir d'un brief et du contexte du site.
Règles :
- Choisis en priorité dans la bibliothèque fournie (par identifiant exact). N'ajoute une plante que si la bibliothèque ne couvre pas le besoin.
- Espèces adaptées au climat de l'adresse et à son évolution (étés plus chauds et plus secs), à l'exposition et à la pente du massif, au niveau de résistance à la sécheresse demandé.
- Noms latins exacts et existants (genre, espèce, cultivar entre guillemets simples). Ne rien inventer : pas de cultivar dont tu n'es pas sûr.
- Signale toute incertitude (identification, rusticité, disponibilité en pépinière) dans le champ prévu.
- Dimensions réalistes pour l'Île-de-France ; largeur à 3 ans inférieure ou égale à la largeur adulte.
- Une palette resserrée (souvent 5 à 9 espèces) avec des répétitions vaut mieux qu'un catalogue.
- Tu ne fournis jamais de positions ni de coordonnées : le placement est calculé par un algorithme.
Réponds en français.`;

const SYSTEME_INTENTION = `Tu es paysagiste concepteur. Pour une palette validée, tu définis l'intention de composition d'un massif.
Pour chaque plante : la quantité totale, le rôle (structure, fond, masse, ponctuation, bordure, couvre_sol), la profondeur (fond, milieu, devant), la taille des groupes (nombre impair : 1, 3, 5, 7…) et le nombre de répétitions (groupes répartis dans le massif).
Règles :
- Les plus hautes au fond, les plus basses devant ; la bordure suit le bord avant.
- Quantités cohérentes avec la surface, la largeur à 3 ans des plantes et la densité demandée (serrée, standard, aérée) : le massif doit être couvert à 3 ans sans surdensité.
- Répétitions et rythmes plutôt que des sujets isolés, sauf ponctuations et sujets de structure.
- Pour une structure géométrique, renseigne la symétrie et les motifs (par exemple sujets de structure en alignement régulier encadrant des masses fleuries) ; sinon mets « geometrie » à null.
- Tu ne fournis jamais de positions ni de coordonnées : un algorithme place les plantes selon ton intention.
Réponds en français.`;

function texteBrief(brief: Brief): string {
  const style = brief.style === "autre" && brief.styleAutre ? brief.styleAutre : LIBELLES_STYLES[brief.style];
  return [
    `Description : ${brief.description || "(non renseignée)"}`,
    `Style : ${style}`,
    `Structure : ${brief.structure}`,
    `Couleurs dominantes : ${brief.couleurs.join(", ") || "libre"}`,
    `Saisons de floraison : ${brief.saisons.join(", ") || "libre"}`,
    `Hauteurs : de ${brief.hauteurMin} m à ${brief.hauteurMax} m`,
    `Part de persistants : ${brief.partPersistants} %`,
    `Entretien : ${brief.entretien}`,
    `Densité : ${brief.densite}`,
    `Résistance à la sécheresse demandée : ${brief.secheresse}`,
    `Contexte climatique : ${brief.contexteClimatique}`,
  ].join("\n");
}

function texteContexte(c: Contexte): string {
  return [
    `Surface : ${c.surface_m2} m², ${c.longueur_m} m × ${c.largeur_m} m, forme ${c.forme}`,
    `Exposition : ${c.exposition} (${c.detailExposition})`,
    `Pente : ${c.pente ? `${c.pente.pourcent} %, descend vers le ${c.pente.descendVers}` : "terrain plat"}`,
    `Devant et fond : ${c.devant.description}`,
    `Plantes existantes : ${c.plantesExistantes.length === 0 ? "aucune" : c.plantesExistantes.map((p) => `${p.nom_latin} (${p.dansMassif ? "dans le massif" : `à ${p.distance_m} m`})`).join(", ")}`,
  ].join("\n");
}

function texteBibliotheque(b: PlanteBibliotheque[]): string {
  return b.map((p) => JSON.stringify({
    id: p.id, nom_latin: p.nom_latin, nom_commun: p.nom_commun, categorie: p.categorie,
    hauteur_m: p.hauteur_adulte_m, largeur_m: p.largeur_adulte_m, largeur_3ans_m: p.largeur_3ans_m,
    forme: p.forme, feuillage: p.feuillage, floraison: [p.couleur_floraison, p.periode_floraison].filter(Boolean).join(", ") || null,
    exposition: p.exposition, besoin_eau: p.besoin_eau, resistance_secheresse: p.resistance_secheresse,
  })).join("\n");
}

// ─── Appel 1 : palette ─────────────────────────────────────────────────

export async function genererPalette(brief: Brief, contexte: Contexte, bibliotheque: PlanteBibliotheque[]): Promise<ResultatIA<Palette>> {
  const brute = process.env.COMPOSITION_IA === "simule"
    ? paletteSimulee(brief, bibliotheque)
    : await appelerStructure(schemaPalette, SYSTEME_PALETTE,
      `<brief>\n${texteBrief(brief)}\n</brief>\n\n<contexte>\n${texteContexte(contexte)}\n</contexte>\n\n<bibliotheque>\n${texteBibliotheque(bibliotheque)}\n</bibliotheque>`);
  return { ...brute, donnees: nettoyerPalette(brute.donnees, bibliotheque) };
}

// ─── Appel 2 : intention ───────────────────────────────────────────────

export async function genererIntention(brief: Brief, contexte: Contexte, palette: PlanteBibliotheque[]): Promise<ResultatIA<Intention>> {
  const brute = process.env.COMPOSITION_IA === "simule"
    ? intentionSimulee(brief, contexte, palette)
    : await appelerStructure(schemaIntention, SYSTEME_INTENTION,
      `<brief>\n${texteBrief(brief)}\n</brief>\n\n<contexte>\n${texteContexte(contexte)}\n</contexte>\n\n<palette_validee>\n${texteBibliotheque(palette)}\n</palette_validee>`);
  // Plantes hors palette ignorées, quantités au moins 1
  const ids = new Set(palette.map((p) => p.id));
  return {
    ...brute,
    donnees: {
      ...brute.donnees,
      plantes: brute.donnees.plantes
        .filter((p) => ids.has(p.plante_id))
        .map((p) => ({ ...p, quantite: Math.max(1, p.quantite), repetitions: Math.max(1, p.repetitions) })),
    },
  };
}

// ─── Mode simulé (tests) ───────────────────────────────────────────────

function paletteSimulee(brief: Brief, bibliotheque: PlanteBibliotheque[]): ResultatIA<Palette> {
  const jeton = brief.description.match(/\[e2e:([a-z0-9-]+)\]/i)?.[1] ?? "simulee";
  const retenues = bibliotheque.slice(0, 4).map((p) => ({ plante_id: p.id, raison: `Retenue (simulation) : ${p.nom_commun}` }));
  return {
    modele: "simule",
    cout: 0.0123,
    donnees: schemaPalette.parse({
      retenues,
      ajouts: [{
        nom_latin: `Sesleria autumnalis 'E2E ${jeton}'`,
        nom_commun: "Seslérie d'automne (test)",
        categorie: "graminee",
        largeur_adulte_m: 0.5, hauteur_adulte_m: 0.5, largeur_3ans_m: 0.4,
        forme: "touffe", feuillage: "persistant", couleur_feuillage: "vert clair",
        couleur_floraison: "argentée", periode_floraison: "août-octobre",
        exposition: ["soleil", "mi_ombre"], besoin_eau: "faible", resistance_secheresse: "elevee",
        raison: "Graminée de bordure résistante à la sécheresse (simulation)",
        incertitude: null,
      }],
      remarques: "Palette simulée pour les tests.",
    }),
  };
}

function intentionSimulee(brief: Brief, contexte: Contexte, palette: PlanteBibliotheque[]): ResultatIA<Intention> {
  const triees = [...palette].sort((a, b) => (b.hauteur_adulte_m ?? 0) - (a.hauteur_adulte_m ?? 0));
  const n = triees.length;
  return {
    modele: "simule",
    cout: 0.0089,
    donnees: schemaIntention.parse({
      plantes: triees.map((p, i) => {
        const profondeur = i < n / 3 ? "fond" : i < (2 * n) / 3 ? "milieu" : "devant";
        const rayon = (p.largeur_3ans_m ?? (p.largeur_adulte_m ?? 0.6) * 0.7) / 2;
        const quantite = Math.max(1, Math.min(9, Math.round((contexte.surface_m2 / n) / (Math.PI * rayon * rayon * 2.5))));
        return {
          plante_id: p.id,
          quantite,
          role: i === 0 && brief.structure === "geometrique" ? "structure" : profondeur === "fond" ? "fond" : "masse",
          profondeur,
          taille_groupe: quantite >= 3 ? 3 : 1,
          repetitions: Math.max(1, Math.ceil(quantite / 3)),
        };
      }),
      geometrie: brief.structure === "geometrique" ? { symetrie: "gauche_droite", motifs: [] } : null,
      explication: "Intention simulée pour les tests : les plus hautes au fond, répétitions par groupes de trois.",
    }),
  };
}
