import { NextResponse } from "next/server";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";
import { genererAnalyse, erreurConfigurationIA, ErreurComposition } from "@/modules/conception/composition/ia";
import { nettoyerAnalyse } from "@/modules/conception/composition/controles";
import { schemaDemandeAnalyse, schemaAnalyseValidee } from "@/modules/conception/composition/schemas";

// Un appel à l'IA avec images et réflexion peut durer plusieurs dizaines de secondes
export const maxDuration = 300;

/**
 * Démarre une composition par l'analyse des vues calées.
 * - Une analyse validée de même empreinte (contour, vues, existant) est réutilisée,
 *   sans appel à l'IA, sauf « Refaire l'analyse ».
 * - Sinon les images sont requises : réponse 200 { ok: false, code: "images_requises" }
 *   (le navigateur les génère et renvoie la demande). Ce n'est pas une erreur.
 * - Chaque refus porte un code et un message explicite.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id } = await params;
    const corps = schemaDemandeAnalyse.safeParse(await request.json().catch(() => null));
    if (!corps.success) {
      return NextResponse.json({ ok: false, code: "demande_invalide", error: `Demande d'analyse invalide : ${corps.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}` }, { status: 400 });
    }
    const d = corps.data;

    const { data: projet } = await supabase.from("conception_projets").select("id").eq("id", id).single();
    if (!projet) return NextResponse.json({ ok: false, code: "projet_introuvable", error: "Projet introuvable." }, { status: 404 });

    // Configuration vérifiée avant toute préparation d'images : refus immédiat et explicite
    const erreurIA = erreurConfigurationIA();
    if (erreurIA) return NextResponse.json({ ok: false, code: "ia_non_configuree", error: erreurIA }, { status: 503 });

    const base = { projet_id: id, zone_id: d.zoneId, brief: d.brief, contexte: d.contexte, analyse_empreinte: d.empreinte };

    // Réutilisation d'une analyse validée de même empreinte
    if (!d.refaire) {
      const { data: precedente } = await supabase
        .from("conception_compositions")
        .select("analyse_existant")
        .eq("projet_id", id).eq("zone_id", d.zoneId).eq("analyse_empreinte", d.empreinte).eq("analyse_validee", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const validee = precedente ? schemaAnalyseValidee.safeParse(precedente.analyse_existant) : null;
      if (validee?.success) {
        const { data: compo, error } = await supabase
          .from("conception_compositions")
          .insert({ ...base, analyse_existant: validee.data, analyse_validee: true, cout: 0 })
          .select("id").single();
        if (error) {
          console.error("[compositions] enregistrement (réutilisation) :", error);
          return NextResponse.json({ ok: false, code: "enregistrement", error: `Enregistrement de la composition impossible : ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ ok: true, compositionId: compo.id, analyse_existant: validee.data, reutilisee: true, cout: 0 });
      }
    }

    if (!d.images) return NextResponse.json({ ok: false, code: "images_requises" });

    const { donnees, modele, cout } = await genererAnalyse({ brief: d.brief, contexte: d.contexte, grille: d.grille, casesMassif: d.casesMassif, images: d.images });
    const analyse = nettoyerAnalyse(donnees, d.grille);

    const { data: compo, error } = await supabase
      .from("conception_compositions")
      .insert({ ...base, analyse_existant: analyse, analyse_validee: false, modele, cout })
      .select("id").single();
    if (error) {
      console.error("[compositions] enregistrement de l'analyse :", error);
      return NextResponse.json({ ok: false, code: "enregistrement", error: `Enregistrement de l'analyse impossible : ${error.message}` }, { status: 500 });
    }

    // Images envoyées au modèle, conservées avec la composition
    const dossier = `projets/${id}/compositions/${compo.id}`;
    const fichiers: [string, string][] = [["plan.jpg", d.images.plan], ...d.images.vues.map((v, i) => [`vue-${i + 1}.jpg`, v.image] as [string, string])];
    for (const [nom, b64] of fichiers) {
      await supabase.storage.from("conception").upload(`${dossier}/${nom}`, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: true });
    }

    return NextResponse.json({ ok: true, compositionId: compo.id, analyse_existant: analyse, reutilisee: false, cout });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ErreurComposition) {
      console.error("[compositions] analyse :", e.message);
      return NextResponse.json({ ok: false, code: "ia", error: e.message }, { status: e.status });
    }
    console.error("[compositions] analyse :", e);
    return NextResponse.json({ ok: false, code: "inattendue", error: `L'analyse des vues a échoué : ${e instanceof Error ? e.message.slice(0, 200) : "erreur inattendue"}` }, { status: 502 });
  }
}
