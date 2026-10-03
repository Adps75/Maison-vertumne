import { NextRequest, NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SCHEMA = {
  type: "object" as const,
  required: ["nom_commun", "categorie", "hauteur_adulte_m", "largeur_adulte_m", "feuillage", "couleur_feuillage"],
  properties: {
    nom_commun: { type: "string", description: "Nom commun en français" },
    categorie: { type: "string", enum: ["arbre", "arbuste", "vivace", "graminee", "couvre_sol", "grimpante"] },
    hauteur_adulte_m: { type: "number", description: "Hauteur adulte en mètres" },
    largeur_adulte_m: { type: "number", description: "Largeur adulte en mètres" },
    feuillage: { type: "string", enum: ["persistant", "caduc"] },
    couleur_feuillage: { type: "string", description: "Couleur du feuillage (ex: vert foncé)" },
    couleur_floraison: { type: "string", description: "Couleur de la floraison, ou null si insignifiante" },
    periode_floraison: { type: "string", description: "Période de floraison (ex: mai-juin), ou null" },
    notes: { type: "string", description: "Caractéristiques notables pour un paysagiste (sol, exposition, rusticité, entretien), 2 phrases max" },
  },
};

export async function POST(request: NextRequest) {
  try {
    await exigerAdmin("api");
    const { nom_latin, forme } = await request.json();

    if (!nom_latin?.trim()) {
      return NextResponse.json({ ok: false, error: "Nom latin requis." }, { status: 400 });
    }

    const anthropic = new Anthropic();
    const modele = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

    const response = await anthropic.messages.create({
      model: modele,
      max_tokens: 512,
      tools: [{
        name: "fiche_plante",
        description: "Remplit la fiche botanique d'une plante à partir de son nom latin.",
        input_schema: SCHEMA,
      }],
      tool_choice: { type: "tool", name: "fiche_plante" },
      messages: [{
        role: "user",
        content: `Remplis la fiche botanique de la plante "${nom_latin}"${forme ? ` (forme : ${forme})` : ""}. Données pour un paysagiste en Île-de-France. Hauteur et largeur à l'âge adulte en mètres. Sois précis et concis.`,
      }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use" && b.name === "fiche_plante");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ ok: false, error: "L'IA n'a pas renvoyé de fiche." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, fiche: toolBlock.input });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
