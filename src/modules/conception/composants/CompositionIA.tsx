"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Element, NumeroEtape } from "../types";
import type { Action } from "../editeur/reducer";
import { derniereActionHistorique } from "../editeur/reducer";
import type { Pt } from "../geo/plan";
import { genererIdLocal } from "@/lib/id-client";
import { extrairePointsSurface } from "../scene3d/preparer-donnees";
import { extraireVoisines } from "../vegetaux/ecartement";
import {
  dimensionsEtForme, exposition, pente, devantDuMassif, plantesAutour,
  type BatimentPlan, type VuePlan,
} from "../composition/contexte";
import { placerComposition, COUVERTURE_CIBLE, type EcartQuantite, type Densite } from "../composition/placement";
import {
  plantesAPlacer, toleranceDensite, elementsComposition, plantesCompositionExistante, plantesAbsentes, messagePlantesAbsentes,
} from "../composition/application";
import { NATURES_VEGETALES, type AnalyseValidee, type Contexte, type NatureExistant } from "../composition/schemas";
import { grilleMassif, toutesLesCases, caseDuPoint, type Grille } from "../composition/grille";
import { creerProjecteur } from "../camera/projection";
import type { CameraParams } from "../camera/types";
import { vueVoitMassif } from "../composition/projection-vue";
import { rectsDesCases, empriseDesCases, cerclesExclusion, referenceExistant } from "../composition/exclusions";
import { empreinteAnalyse } from "../composition/empreinte";
import { dessinerPlan, dessinerVue } from "../composition/images-analyse";
import { pointDansPolygone } from "../geo/plan";
import {
  AssistantComposition, type CompositionPrete, type ContourComposition, type PreparationAnalyse,
} from "./AssistantComposition";

interface BatimentGeo {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  hauteur: number | null;
}

interface VueGeo {
  id: string;
  projetId: string;
  nom: string;
  camera: CameraParams;
  statut: "a_caler" | "cale";
  largeurPx: number;
  hauteurPx: number;
}

/** Catégorie et forme d'un végétal existant ajouté au plan, d'après sa nature. */
const CATEGORIE_EXISTANT: Partial<Record<NatureExistant, { categorie: string; forme: string | null }>> = {
  arbre: { categorie: "arbre", forme: null },
  arbuste: { categorie: "arbuste", forme: null },
  topiaire: { categorie: "arbuste", forme: "boule" },
  haie: { categorie: "arbuste", forme: null },
  massif: { categorie: "vivace", forme: null },
  graminee: { categorie: "graminee", forme: "touffe" },
  couvre_sol: { categorie: "couvre_sol", forme: null },
  grimpante: { categorie: "grimpante", forme: null },
};

interface Params {
  projetId: string;
  etape: NumeroEtape;
  elements: Map<string, Element>;
  zoneActive: string | null;
  dispatch: React.Dispatch<Action>;
  batiments: BatimentGeo[];
  vues: VueGeo[];
  altitudeEn: ((x: number, y: number) => number) | null;
  /** Altitude utilisée par les vues calées (identique au Visuel). */
  altitudeVue: (x: number, y: number) => number;
  ortho: { url: string; emprise: [number, number, number, number] } | null;
  tolerance: number;
}

interface CompositionAffichee extends CompositionPrete {
  graine: number;
  ids: string[];
  suppressions: string[];
  ecarts: EcartQuantite[];
  /** Part de la surface plantable couverte à 3 ans (0–1), et objectif de la densité. */
  couverture: number;
  objectif: number;
}

function batimentsPlan(batiments: BatimentGeo[]): BatimentPlan[] {
  return batiments.map((b) => {
    const anneaux = b.geometry.type === "MultiPolygon" ? b.geometry.coordinates.flat(1) : b.geometry.coordinates;
    return { contour: (anneaux[0] ?? []).map(([x, y]) => [x, y] as Pt), hauteur: b.hauteur ?? 6 };
  });
}

/**
 * Composition IA : assistant (brief, palette), application au plan en une action
 * annulable, confirmation de remplacement, barre « Garder / Autre proposition / Annuler ».
 */
export function useCompositionIA(p: Params): { ouvrir: () => void; rendu: ReactNode } {
  const [ouvert, setOuvert] = useState(false);
  const [affichee, setAffichee] = useState<CompositionAffichee | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{ pret: CompositionPrete; existantes: string[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Contours possibles : zones et surfaces dessinées
  const contours = useMemo(() => {
    const liste: (ContourComposition & { points: Pt[] })[] = [];
    let n = 0;
    for (const el of p.elements.values()) {
      if (el.type !== "zone" && el.type !== "sol") continue;
      const points = extrairePointsSurface(el);
      if (!points) continue;
      const nom = el.type === "zone"
        ? `Zone « ${(el.proprietes.nom as string) || "sans nom"} »${el.id === p.zoneActive ? " (active)" : ""}`
        : `Surface dessinée ${++n} (${el.calque})`;
      liste.push({ id: el.id, nom, points });
    }
    return liste;
  }, [p.elements, p.zoneActive]);

  const bats = useMemo(() => batimentsPlan(p.batiments), [p.batiments]);
  const vues: VuePlan[] = useMemo(
    () => p.vues.map((v) => ({ nom: v.nom, position: [v.camera.x, v.camera.y] as Pt, calee: v.statut === "cale" })),
    [p.vues],
  );

  const pointsContour = useCallback((id: string) => contours.find((c) => c.id === id)?.points ?? null, [contours]);

  const calculerContexte = useCallback((contourId: string): Contexte | null => {
    const points = pointsContour(contourId);
    if (!points) return null;
    const devant = devantDuMassif(points, vues, bats);
    const existantes = [];
    for (const el of p.elements.values()) {
      if (el.type === "vegetal" && el.geometrie.type === "point" && !el.proprietes.composition_id) {
        existantes.push({
          position: el.geometrie.position,
          nom_latin: (el.proprietes.nom_latin as string) ?? "",
          nom_commun: (el.proprietes.nom_commun as string) ?? "",
        });
      }
    }
    return {
      ...dimensionsEtForme(points),
      ...exposition(points, bats),
      pente: pente(points, p.altitudeEn),
      devant: devant.devant,
      plantesExistantes: plantesAutour(points, existantes),
      vues: vues.filter((v) => v.calee).map((v) => ({ nom: v.nom, principale: v.nom === devant.vuePrincipale })),
    };
  }, [pointsContour, vues, bats, p.elements, p.altitudeEn]);

  /** Végétaux du plan hors composition et hors existant issu d'une analyse (pour l'empreinte). */
  const existantDuPlan = useCallback((g: Grille) => {
    const out: { id: string; position: Pt; diametre: number }[] = [];
    for (const el of p.elements.values()) {
      if (el.type !== "vegetal" || el.geometrie.type !== "point") continue;
      if (el.proprietes.composition_id || el.proprietes.existant_analyse) continue;
      if (caseDuPoint(g, el.geometrie.position)) out.push({ id: el.id, position: el.geometrie.position, diametre: (el.proprietes.diametre_m as number) ?? 1 });
    }
    return out;
  }, [p.elements]);

  const preparerAnalyse = useCallback((contourId: string): PreparationAnalyse | null => {
    const points = pointsContour(contourId);
    if (!points) return null;
    const grille = grilleMassif(points);
    let casesMassif = toutesLesCases(grille).filter((c) => pointDansPolygone(c.centre, points)).map((c) => c.texte);
    if (casesMassif.length === 0) casesMassif = [...new Set(points.map((q) => caseDuPoint(grille, q)).filter((c): c is string => !!c))];

    // Vues calées qui voient le massif : la principale d'abord, 2 au plus
    const principale = devantDuMassif(points, vues, bats).vuePrincipale;
    const voient = p.vues
      .filter((v) => v.statut === "cale")
      .filter((v) => vueVoitMassif(points, creerProjecteur(v.camera, p.altitudeVue, v.largeurPx, v.hauteurPx), p.altitudeVue))
      .sort((a, b) => Number(b.nom === principale) - Number(a.nom === principale))
      .slice(0, 2);
    const estPrincipale = (v: VueGeo, i: number) => v.nom === principale || (i === 0 && !voient.some((x) => x.nom === principale));

    const empreinte = empreinteAnalyse({
      contour: points,
      vues: voient.map((v) => ({ id: v.id, camera: v.camera })),
      existant: existantDuPlan(grille),
    });

    const genererImages = async () => {
      const plantes = [];
      for (const el of p.elements.values()) {
        if (el.type !== "vegetal" || el.geometrie.type !== "point") continue;
        plantes.push({
          position: el.geometrie.position,
          diametre: (el.proprietes.diametre_m as number) ?? 1,
          nom: ((el.proprietes.nom_commun as string) || (el.proprietes.nom_latin as string) || "").slice(0, 24),
        });
      }
      const plan = await dessinerPlan({
        grille, contour: points, plantes, ortho: p.ortho,
        vues: voient.map((v) => ({ nom: v.nom, camera: v.camera, aspect: v.largeurPx / v.hauteurPx })),
      });
      const images = [];
      for (const [i, v] of voient.entries()) {
        images.push({
          nom: v.nom,
          principale: estPrincipale(v, i),
          image: await dessinerVue({
            photoUrl: `/api/conception/projets/${v.projetId}/points-de-vue/${v.id}/image`,
            largeurPx: v.largeurPx, hauteurPx: v.hauteurPx, camera: v.camera,
            altitudeEn: p.altitudeVue, grille, contour: points,
          }),
        });
      }
      return { plan, vues: images };
    };

    return { grille, casesMassif, empreinte, vues: voient.map((v, i) => ({ nom: v.nom, principale: estPrincipale(v, i) })), genererImages };
  }, [pointsContour, vues, bats, p.vues, p.altitudeVue, p.elements, p.ortho, existantDuPlan]);

  /** Ajoute au plan les végétaux existants validés (statut « existant », plan uniquement), en une action. */
  const onAnalyseValidee = useCallback((analyse: AnalyseValidee, grille: Grille) => {
    const deja: Pt[] = [];
    for (const el of p.elements.values()) {
      if (el.statut === "existant" && el.geometrie.type === "point") deja.push(el.geometrie.position);
    }
    const ajouts: Element[] = [];
    for (const e of analyse.existants) {
      // Seul un végétal conservé est ajouté au plan (jamais une surface ni un élément supprimé)
      if (!e.ajouterAuPlan || e.recommandation !== "conserver" || !NATURES_VEGETALES.includes(e.nature)) continue;
      const rects = rectsDesCases(grille, e.cases);
      const emprise = empriseDesCases(rects);
      if (!emprise) continue;
      // Haie : pavé orienté selon le plus grand côté de ses cases
      const largeurX = Math.max(...rects.map((r) => r.x1)) - Math.min(...rects.map((r) => r.x0));
      const largeurY = Math.max(...rects.map((r) => r.y1)) - Math.min(...rects.map((r) => r.y0));
      if (deja.some((q) => Math.hypot(q[0] - emprise.centre[0], q[1] - emprise.centre[1]) < 0.3)) continue;
      const espece = e.espece_probable ?? "";
      const cat = CATEGORIE_EXISTANT[e.nature] ?? { categorie: "arbuste", forme: null };
      ajouts.push({
        id: genererIdLocal(),
        type: "vegetal",
        geometrie: { type: "point", position: emprise.centre },
        calque: "existant",
        statut: "existant",
        hauteur: e.hauteur_estimee_m ?? 1,
        proprietes: {
          nom_commun: espece.split("(")[1]?.replace(")", "").trim() || espece.split("(")[0].trim() || e.nature,
          nom_latin: espece.split("(")[0].trim(),
          diametre_m: emprise.diametre,
          hauteur_m: e.hauteur_estimee_m ?? 1,
          categorie: cat.categorie,
          forme: cat.forme,
          nature: e.nature,
          existant_analyse: true,
          // Volume masquant du Visuel et du rendu IA ; modifiable dans les propriétés
          forme_existant: e.forme ?? "boule",
          existant_ref: referenceExistant(e),
          ...(e.forme === "haie" ? { longueur_m: Math.max(largeurX, largeurY), orientation_deg: largeurX >= largeurY ? 0 : 90 } : {}),
        },
        ordre: p.elements.size + ajouts.length,
      });
      deja.push(emprise.centre);
    }
    if (ajouts.length > 0) p.dispatch({ type: "APPLIQUER_COMPOSITION", ajouts, suppressions: [] });
  }, [p]);

  /** Calcule le placement et l'applique en UNE action annulable. */
  const appliquer = useCallback((pret: CompositionPrete, graine: number, suppressions: string[]) => {
    const points = pointsContour(pret.contourId);
    if (!points) return;
    const exclues = new Set(suppressions);
    const existantes = extraireVoisines(p.elements).filter((v) => !exclues.has(v.id));
    // Existant conservé : cercles à son emprise réelle (élément du plan, sinon d'après ses cases)
    const existantsPlan = [];
    for (const el of p.elements.values()) {
      if (el.type !== "vegetal" || el.statut !== "existant" || el.geometrie.type !== "point") continue;
      existantsPlan.push({
        position: el.geometrie.position,
        diametre: (el.proprietes.diametre_m as number) ?? 1,
        reference: (el.proprietes.existant_ref as string) ?? null,
        libelle: (el.proprietes.nom_commun as string) ?? "",
      });
    }
    const exclusions = cerclesExclusion({ existantsPlan, analyse: pret.analyse, grille: pret.grille });
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__compositionTest = { grille: pret.grille, exclusions };
    }
    const devant = devantDuMassif(points, vues, bats);
    const densite: Densite = pret.brief.densite;
    const resultat = placerComposition({
      contour: points,
      plantes: plantesAPlacer(pret.intention, pret.plantes),
      versDevant: devant.versDevant,
      observateur: devant.pointDeVue,
      geometrique: pret.brief.structure === "geometrique" || pret.intention.geometrie?.symetrie === "gauche_droite",
      tolerance: toleranceDensite(p.tolerance, densite),
      densite,
      existantes,
      graine,
      exclusions,
    });
    const ajouts = elementsComposition({
      placements: resultat.placements,
      plantes: pret.plantes,
      compositionId: pret.compositionId,
      contourId: pret.contourId,
      ordreBase: p.elements.size,
      genererId: genererIdLocal,
    });
    p.dispatch({ type: "APPLIQUER_COMPOSITION", ajouts, suppressions });
    setAffichee({
      ...pret, graine, ids: ajouts.map((a) => a.id), suppressions, ecarts: resultat.ecarts,
      couverture: resultat.couverture, objectif: COUVERTURE_CIBLE[densite],
    });
  }, [pointsContour, p, vues, bats]);

  /** Vérifie que chaque plante de la palette existe toujours dans la bibliothèque (message sinon). */
  const palettePresente = useCallback(async (pret: CompositionPrete): Promise<boolean> => {
    const ids = pret.plantes.map((x) => x.id);
    const r = await fetch(`/api/conception/plantes?ids=${ids.join(",")}`).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return true; // vérification impossible (réseau) : le placement reste local, sans risque
    const absentes = plantesAbsentes(pret.plantes, (r.plantes as { id: string }[]).map((x) => x.id));
    if (absentes.length === 0) return true;
    setMessage(messagePlantesAbsentes(absentes));
    return false;
  }, []);

  const onComposer = useCallback(async (pret: CompositionPrete) => {
    setOuvert(false);
    if (!(await palettePresente(pret))) return;
    const existantes = plantesCompositionExistante(p.elements.values(), pret.contourId);
    if (existantes.length > 0) setAConfirmer({ pret, existantes });
    else appliquer(pret, 1, []);
  }, [p.elements, appliquer, palettePresente]);

  /** La dernière action annulable est-elle bien cette composition ? */
  const estDerniere = useCallback((c: CompositionAffichee) => {
    const d = derniereActionHistorique(p.etape);
    return d?.type === "composition" && d.apres[0]?.id === c.ids[0];
  }, [p.etape]);

  const garder = async () => {
    if (!affichee) return;
    await fetch(`/api/conception/projets/${p.projetId}/compositions/${affichee.compositionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graine: affichee.graine }),
    }).catch(() => {});
    setAffichee(null);
  };

  const autreProposition = async () => {
    if (!affichee) return;
    if (!estDerniere(affichee)) {
      setMessage("Le plan a été modifié depuis la composition : utilisez Cmd+Z pour revenir en arrière.");
      setAffichee(null);
      return;
    }
    if (!(await palettePresente(affichee))) { setAffichee(null); return; }
    p.dispatch({ type: "ANNULER" });
    appliquer(affichee, affichee.graine + 1, affichee.suppressions);
  };

  const annuler = () => {
    if (affichee && estDerniere(affichee)) p.dispatch({ type: "ANNULER" });
    else if (affichee) setMessage("Le plan a été modifié depuis la composition : utilisez Cmd+Z pour revenir en arrière.");
    setAffichee(null);
  };

  const nomsEcarts = (e: EcartQuantite[]) => {
    const parId = new Map(affichee?.plantes.map((x) => [x.id, x.nom_commun]) ?? []);
    return e.map((x) => `${parId.get(x.cle) ?? x.cle} : ${x.place} sur ${x.demande}`).join(", ");
  };

  const rendu = (
    <>
      {ouvert && (
        <AssistantComposition
          projetId={p.projetId}
          contours={contours}
          contourParDefaut={p.zoneActive && contours.some((c) => c.id === p.zoneActive) ? p.zoneActive : contours[0]?.id ?? null}
          calculerContexte={calculerContexte}
          preparerAnalyse={preparerAnalyse}
          onAnalyseValidee={onAnalyseValidee}
          onComposer={onComposer}
          onFermer={() => setOuvert(false)}
        />
      )}

      {aConfirmer && (
        <div className="fixed inset-0 z-[70] bg-ink/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="confirmer-remplacement">
          <div className="bg-paper text-ink rounded shadow-xl max-w-md p-5 text-[0.85rem]">
            <p className="font-medium mb-2" data-testid="message-composition-existante">Une composition existe déjà sur ce massif. La remplacer ?</p>
            <p className="mb-4">
              Elle compte {aConfirmer.existantes.length} plantes et sera remplacée en une seule action (annulable).
              Les plantes ajoutées à la main sont conservées.
            </p>
            <div className="flex justify-end gap-2">
              <button className="border border-hair-light hover:bg-paper-2 rounded px-3 py-1.5" onClick={() => setAConfirmer(null)}>Annuler</button>
              <button className="bg-brass hover:bg-brass-soft text-paper rounded px-3 py-1.5" data-testid="btn-confirmer-remplacement"
                onClick={async () => { const c = aConfirmer; setAConfirmer(null); if (await palettePresente(c.pret)) appliquer(c.pret, 1, c.existantes); }}>
                Remplacer
              </button>
            </div>
          </div>
        </div>
      )}

      {affichee && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] bg-ink text-paper rounded shadow-xl px-4 py-2.5 flex items-center gap-3 text-[0.8rem] max-w-[95vw]"
          data-testid="barre-composition">
          <span>
            <strong>Composition IA</strong> · {affichee.ids.length} plantes ·{" "}
            <span className={affichee.couverture < affichee.objectif ? "text-brass-soft font-medium" : ""} data-testid="couverture-surface"
              title={`Projection des couronnes à 3 ans sur la surface plantable (objectif ${Math.round(affichee.objectif * 100)} %)`}>
              Surface couverte : {Math.round(affichee.couverture * 100)} %
            </span>
            {affichee.ecarts.length > 0 && <span className="text-amber-200" data-testid="ecarts-composition"> · place insuffisante ({nomsEcarts(affichee.ecarts)})</span>}
          </span>
          <button className="bg-brass hover:bg-brass-soft rounded px-3 py-1" onClick={garder} data-testid="btn-garder-composition">Garder</button>
          <button className="border border-paper/40 hover:bg-paper/10 rounded px-3 py-1" onClick={autreProposition} data-testid="btn-autre-proposition">Autre proposition</button>
          <button className="border border-paper/40 hover:bg-paper/10 rounded px-3 py-1" onClick={annuler} data-testid="btn-annuler-composition">Annuler</button>
        </div>
      )}

      {message && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] bg-paper text-ink border border-hair-light rounded shadow px-4 py-2 text-[0.8rem]" role="status">
          {message}
          <button className="ml-3 text-stone hover:text-ink" onClick={() => setMessage(null)} aria-label="Fermer">×</button>
        </div>
      )}
    </>
  );

  return { ouvrir: () => { setMessage(null); setOuvert(true); }, rendu };
}
