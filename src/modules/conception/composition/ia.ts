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
  schemaPalette, schemaIntention, schemaAnalyse, LIBELLES_STYLES,
  type Brief, type Contexte, type Palette, type Intention, type Analyse, type AnalyseValidee,
} from "./schemas";
import { decrireGrille, type Grille } from "./grille";
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

/** Message d'erreur si l'IA de composition n'est pas configurée sur le serveur, sinon null. */
export function erreurConfigurationIA(): string | null {
  if (process.env.COMPOSITION_IA === "simule") return null;
  if (!process.env.ANTHROPIC_MODEL_COMPOSITION?.trim()) {
    return "La composition IA n'est pas configurée sur le serveur : la variable ANTHROPIC_MODEL_COMPOSITION est absente (ajoutez-la à .env.local, puis redémarrez le serveur).";
  }
  return null;
}

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

async function appelerStructure<S extends z.ZodType>(
  schema: S,
  systeme: string,
  message: string | Anthropic.Beta.BetaContentBlockParam[],
): Promise<ResultatIA<z.infer<S>>> {
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
- Si une analyse du site est fournie : harmonise avec l'existant conservé (par exemple reprendre des topiaires en éléments de structure, prolonger une essence présente), adapte les espèces à l'ombre et à la lumière observées, ne propose rien qui entre en concurrence avec un sujet conservé.
- Tu ne fournis jamais de positions ni de coordonnées : le placement est calculé par un algorithme.
Réponds en français.`;

const SYSTEME_INTENTION = `Tu es paysagiste concepteur. Pour une palette validée, tu définis l'intention de composition d'un massif.
Pour chaque plante : la quantité totale, le rôle (structure, fond, masse, ponctuation, bordure, couvre_sol), la profondeur (fond, milieu, devant), la taille des groupes (nombre impair : 1, 3, 5, 7…) et le nombre de répétitions (groupes répartis dans le massif).
Règles :
- Les plus hautes au fond, les plus basses devant ; la bordure suit le bord avant.
- Quantités cohérentes avec la surface, la largeur à 3 ans des plantes et la densité demandée (serrée, standard, aérée) : le massif doit être couvert à 3 ans sans surdensité.
- Répétitions et rythmes plutôt que des sujets isolés, sauf ponctuations et sujets de structure.
- Pour une structure géométrique, renseigne la symétrie et les motifs (par exemple sujets de structure en alignement régulier encadrant des masses fleuries) ; sinon mets « geometrie » à null.
- Si une analyse du site est fournie : la profondeur suit la vue principale (premier plan et fond observés), les plantes d'ombre vont vers les zones d'ombre observées, et les sujets existants conservés occupent déjà leur place (les quantités tiennent compte de la surface qu'ils prennent).
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

// ─── Analyse des vues photo calées ─────────────────────────────────────

const SYSTEME_ANALYSE = `Tu es paysagiste concepteur. Tu analyses un jardin existant à partir d'un plan vu de dessus et de photos prises sur place, avant de composer un massif.
Les images partagent la même grille de repères : sur le plan, la grille est dessinée sur l'orthophoto ; sur chaque photo, la même grille est projetée au sol grâce au calage de la caméra, avec les mêmes étiquettes (lettres pour les colonnes, chiffres pour les lignes). Le contour orange est le massif à composer.
Utilise ces correspondances pour situer chaque élément observé dans les cases de la grille.
Règles :
- Identifie l'existant visible dans le massif et à ses abords : arbres, arbustes, topiaires, haies, massifs, graminées, couvre-sols, grimpantes, statues, murs, bordures, dallages, mobilier.
- Pour chaque élément : nature, espèce probable (nom latin et nom commun) seulement si tu peux la reconnaître, niveau de confiance honnête, cases occupées (uniquement des cases existantes de la grille), hauteur estimée, et recommandation (« conserver » pour un sujet sain et intéressant, « a_evaluer » en cas de doute).
- Décris le style et l'ambiance du jardin, les zones d'ombre et de lumière observées (en cases), et ce qui se voit au premier plan et au fond depuis la vue principale.
- N'invente rien : ce qui n'est pas visible n'est pas décrit ; signale les incertitudes dans les remarques.
- Tu ne fournis aucune coordonnée en dehors des cases de la grille.
Réponds en français.`;

/** Analyse validée, résumée pour la palette et l'intention (sans les images). */
export function texteAnalyse(a: AnalyseValidee | null): string {
  if (!a) return "";
  const existants = a.existants.length === 0 ? "aucun" : a.existants.map((e) =>
    `- ${e.nature}${e.espece_probable ? ` (${e.espece_probable})` : ""}, cases ${e.cases.join(" ")}${e.hauteur_estimee_m ? `, ${e.hauteur_estimee_m} m` : ""} : ${e.recommandation === "conserver" ? "conservé" : "à évaluer"} — ${e.description}`).join("\n");
  const zones = (z: { cases: string[]; description: string }[]) => z.length === 0 ? "aucune" : z.map((x) => `${x.cases.join(" ")} (${x.description})`).join(" ; ");
  return `<analyse_du_site validee_par_le_paysagiste="oui">
Existant (zones d'exclusion du placement) :
${existants}
Style existant : ${a.style_existant}
Ambiance : ${a.ambiance}
Ombre observée : ${zones(a.ombre_lumiere.ombre)}
Lumière observée : ${zones(a.ombre_lumiere.lumiere)}
Premier plan depuis la vue principale : ${a.premier_plan}
Fond depuis la vue principale : ${a.fond}
</analyse_du_site>

`;
}

export async function genererAnalyse(params: {
  brief: Brief;
  contexte: Contexte;
  grille: Grille;
  casesMassif: string[];
  images: { plan: string; vues: { nom: string; principale: boolean; image: string }[] };
}): Promise<ResultatIA<Analyse>> {
  if (process.env.COMPOSITION_IA === "simule") return analyseSimulee(params.casesMassif);
  const { brief, contexte, grille, images } = params;
  const contenu: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `Image 1 — le plan vu de dessus : orthophoto, contour du massif en orange, plantes existantes du projet, caméras des vues avec leur cône de vision et leur nom, grille de repères étiquetée. ${decrireGrille(grille)}` },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.plan } },
  ];
  images.vues.forEach((v, i) => {
    contenu.push(
      { type: "text", text: `Image ${i + 2} — photo de la vue « ${v.nom} »${v.principale ? " (vue principale : elle définit le devant et le fond du massif)" : ""}, avec le contour du massif et la même grille projetés au sol.` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: v.image } },
    );
  });
  contenu.push({ type: "text", text: `<brief>\n${texteBrief(brief)}\n</brief>\n\n<contexte>\n${texteContexte(contexte)}\n</contexte>\n\nAnalyse le site selon les règles, en situant chaque élément dans les cases de la grille.` });
  return appelerStructure(schemaAnalyse, SYSTEME_ANALYSE, contenu);
}

function analyseSimulee(casesMassif: string[]): ResultatIA<Analyse> {
  const milieu = casesMassif[Math.floor(casesMassif.length / 2)] ?? "A1";
  const premiere = casesMassif[0] ?? "A1";
  return {
    modele: "simule",
    cout: 0.0156,
    donnees: schemaAnalyse.parse({
      existants: [
        { nature: "topiaire", description: "Boule taillée au centre du massif", espece_probable: "Buxus sempervirens (buis)", confiance: "moyenne", cases: [milieu], hauteur_estimee_m: 0.8, recommandation: "conserver" },
        { nature: "arbuste", description: "Arbuste isolé à l'angle", espece_probable: null, confiance: "faible", cases: [premiere], hauteur_estimee_m: 1.5, recommandation: "a_evaluer" },
      ],
      style_existant: "Jardin de pavillon, pelouse et quelques sujets taillés (simulation)",
      ambiance: "Calme, ouverte",
      ombre_lumiere: { ombre: [{ cases: [premiere], description: "ombre de l'arbuste en fin de journée" }], lumiere: [{ cases: [milieu], description: "plein soleil l'après-midi" }] },
      premier_plan: "Pelouse et bord avant du massif",
      fond: "Clôture et haie du voisin",
      remarques: "Analyse simulée pour les tests.",
    }),
  };
}

// ─── Appel 1 : palette ─────────────────────────────────────────────────

export async function genererPalette(brief: Brief, contexte: Contexte, bibliotheque: PlanteBibliotheque[], analyse: AnalyseValidee | null = null): Promise<ResultatIA<Palette>> {
  const brute = process.env.COMPOSITION_IA === "simule"
    ? paletteSimulee(brief, bibliotheque)
    : await appelerStructure(schemaPalette, SYSTEME_PALETTE,
      `<brief>\n${texteBrief(brief)}\n</brief>\n\n<contexte>\n${texteContexte(contexte)}\n</contexte>\n\n${texteAnalyse(analyse)}<bibliotheque>\n${texteBibliotheque(bibliotheque)}\n</bibliotheque>`);
  return { ...brute, donnees: nettoyerPalette(brute.donnees, bibliotheque) };
}

// ─── Appel 2 : intention ───────────────────────────────────────────────

export async function genererIntention(brief: Brief, contexte: Contexte, palette: PlanteBibliotheque[], analyse: AnalyseValidee | null = null): Promise<ResultatIA<Intention>> {
  const brute = process.env.COMPOSITION_IA === "simule"
    ? intentionSimulee(brief, contexte, palette)
    : await appelerStructure(schemaIntention, SYSTEME_INTENTION,
      `<brief>\n${texteBrief(brief)}\n</brief>\n\n<contexte>\n${texteContexte(contexte)}\n</contexte>\n\n${texteAnalyse(analyse)}<palette_validee>\n${texteBibliotheque(palette)}\n</palette_validee>`);
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
