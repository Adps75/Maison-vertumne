"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTEXTE_CLIMATIQUE_DEFAUT, LIBELLES_STYLES, SAISONS, STYLES, NATURES_EXISTANT, NATURES_VEGETALES,
  type Brief, type Contexte, type FichePlante, type Intention, type Palette, type AnalyseValidee, type NatureExistant,
} from "../composition/schemas";
import type { PlanteComposee } from "../composition/application";
import { lireCase, etiquette, type Grille } from "../composition/grille";

export interface ContourComposition {
  id: string;
  nom: string;
}

export interface CompositionPrete {
  compositionId: string;
  contourId: string;
  brief: Brief;
  intention: Intention;
  plantes: PlanteComposee[];
  /** Analyse validée : l'existant conservé devient zone d'exclusion du placement. */
  analyse: AnalyseValidee;
  grille: Grille;
}

/** Données d'analyse préparées par la page pour un contour. */
export interface PreparationAnalyse {
  grille: Grille;
  casesMassif: string[];
  empreinte: string;
  /** Vues calées qui voient le massif (2 au plus, la principale d'abord). */
  vues: { nom: string; principale: boolean }[];
  genererImages: () => Promise<{ plan: string; vues: { nom: string; principale: boolean; image: string }[] }>;
}

interface PlanteBiblio extends PlanteComposee {
  statut: string;
  face_url: string | null;
  dessus_url: string | null;
}

type EtatAjout = "attente" | "creation" | "images" | "prete" | "erreur";

interface Props {
  projetId: string;
  contours: ContourComposition[];
  contourParDefaut: string | null;
  calculerContexte: (contourId: string) => Contexte | null;
  preparerAnalyse: (contourId: string) => PreparationAnalyse | null;
  onAnalyseValidee: (analyse: AnalyseValidee, grille: Grille, contourId: string) => void;
  onComposer: (c: CompositionPrete) => void;
  onFermer: () => void;
}

const LIBELLES_SAISONS: Record<(typeof SAISONS)[number], string> = {
  printemps: "Printemps", ete: "Été", automne: "Automne", hiver: "Hiver",
};
const LIBELLES_EXPO: Record<Contexte["exposition"], string> = {
  plein_soleil: "plein soleil", mi_ombre: "mi-ombre", ombre: "ombre",
};

const BRIEF_DEFAUT: Brief = {
  description: "",
  style: "naturel_graminees",
  structure: "libre",
  couleurs: [],
  saisons: ["printemps", "ete", "automne"],
  hauteurMin: 0.2,
  hauteurMax: 1.5,
  partPersistants: 30,
  entretien: "faible",
  densite: "standard",
  secheresse: "elevee",
  contexteClimatique: CONTEXTE_CLIMATIQUE_DEFAUT,
};

const LIBELLES_NATURES: Record<NatureExistant, string> = {
  arbre: "Arbre", arbuste: "Arbuste", topiaire: "Topiaire", haie: "Haie", massif: "Massif", graminee: "Graminée",
  couvre_sol: "Couvre-sol", grimpante: "Grimpante", pelouse: "Pelouse", statue: "Statue", mur: "Mur",
  bordure: "Bordure", dallage: "Dallage", mobilier: "Mobilier", autre: "Autre",
};
const LIBELLES_CONFIANCE = { faible: "confiance faible", moyenne: "confiance moyenne", elevee: "confiance élevée" } as const;

const champBase = "border border-hair-light rounded px-2 py-1.5 bg-paper text-ink text-[0.8rem]";
const champ = `w-full ${champBase}`;
const bouton = "bg-brass hover:bg-brass-soft text-paper rounded px-4 py-2 text-[0.8rem] disabled:opacity-50 disabled:cursor-not-allowed";
const boutonSecondaire = "border border-hair-light hover:bg-paper-2 rounded px-3 py-1.5 text-[0.75rem]";

export function AssistantComposition({ projetId, contours, contourParDefaut, calculerContexte, preparerAnalyse, onAnalyseValidee, onComposer, onFermer }: Props) {
  const [etape, setEtape] = useState<"brief" | "analyse" | "palette">("brief");
  const [analyse, setAnalyse] = useState<AnalyseValidee | null>(null);
  const [analyseReutilisee, setAnalyseReutilisee] = useState(false);
  const [grille, setGrille] = useState<Grille | null>(null);
  const [nouvelElement, setNouvelElement] = useState<{ nature: NatureExistant; espece: string; cases: string }>({ nature: "arbuste", espece: "", cases: "" });
  const [contourId, setContourId] = useState<string>(contourParDefaut ?? contours[0]?.id ?? "");
  const [brief, setBrief] = useState<Brief>(BRIEF_DEFAUT);
  const [couleursTexte, setCouleursTexte] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreurBrute] = useState<{ message: string; action?: { libelle: string; faire: () => void } } | null>(null);
  const setErreur = (message: string | null, action?: { libelle: string; faire: () => void }) =>
    setErreurBrute(message ? { message, action } : null);

  const [compositionId, setCompositionId] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [bibliotheque, setBibliotheque] = useState<PlanteBiblio[]>([]);
  // Palette de travail : identifiants de bibliothèque retenus, ajouts retenus (par nom latin)
  const [retenues, setRetenues] = useState<{ id: string; raison: string; actif: boolean }[]>([]);
  const [ajouts, setAjouts] = useState<{ fiche: FichePlante & { raison: string; incertitude: string | null }; actif: boolean; etat: EtatAjout; idCree?: string; erreur?: string }[]>([]);

  const contexte = useMemo(() => (contourId ? calculerContexte(contourId) : null), [contourId, calculerContexte]);
  const preparation = useMemo(() => (contourId ? preparerAnalyse(contourId) : null), [contourId, preparerAnalyse]);
  const sansVue = !!preparation && preparation.vues.length === 0;

  const chargerBibliotheque = useCallback(async () => {
    const r = await fetch("/api/conception/plantes").then((x) => x.json()).catch(() => null);
    if (r?.ok) setBibliotheque(r.plantes);
  }, []);

  useEffect(() => {
    let actif = true;
    fetch("/api/conception/plantes").then((x) => x.json()).then((r) => { if (actif && r?.ok) setBibliotheque(r.plantes); }).catch(() => {});
    return () => { actif = false; };
  }, []);

  const parId = useMemo(() => new Map(bibliotheque.map((p) => [p.id, p])), [bibliotheque]);
  const majBrief = <K extends keyof Brief>(k: K, v: Brief[K]) => setBrief((b) => ({ ...b, [k]: v }));

  // ─── Étape 1 → 2 : analyse des vues calées ──────────────────────────
  const analyser = async (refaire: boolean) => {
    if (!contexte || !preparation) return;
    if (preparation.vues.length === 0) { setErreur("Calez d'abord au moins une vue qui montre le massif."); return; }
    setErreur(null);
    const corps = { ...brief, couleurs: couleursTexte.split(",").map((c) => c.trim()).filter(Boolean) };
    const demande = (images: Awaited<ReturnType<PreparationAnalyse["genererImages"]>> | null) => fetch(`/api/conception/projets/${projetId}/compositions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zoneId: contourId, brief: corps, contexte, empreinte: preparation.empreinte,
        grille: preparation.grille, casesMassif: preparation.casesMassif, refaire, images,
      }),
    }).then(async (x) => ({ statut: x.status, ...(await x.json().catch(() => ({ ok: false, error: `Réponse illisible du serveur (${x.status}).` }))) }));
    try {
      setEnCours("Recherche d'une analyse enregistrée…");
      let r = refaire ? { statut: 200, ok: false, code: "images_requises" } : await demande(null);
      // Pas d'analyse réutilisable : préparer les images, puis un seul nouvel envoi
      if (!r.ok && r.code === "images_requises") {
        setEnCours("Préparation du plan et des vues…");
        const images = await preparation.genererImages();
        setEnCours("L'IA analyse le plan et les photos…");
        r = await demande(images);
      }
      if (!r.ok) throw new Error(r.error ?? "L'analyse a échoué.");
      setBrief(corps);
      setCompositionId(r.compositionId);
      setGrille(preparation.grille);
      setAnalyseReutilisee(!!r.reutilisee);
      // Analyse brute : les végétaux à conserver sont proposés pour le plan
      setAnalyse({
        ...r.analyse_existant,
        existants: r.analyse_existant.existants.map((e: AnalyseValidee["existants"][number]) => ({
          ...e,
          ajouterAuPlan: e.ajouterAuPlan ?? (NATURES_VEGETALES.includes(e.nature) && e.recommandation === "conserver"),
        })),
      });
      setEtape("analyse");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'analyse a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const majExistant = (i: number, patch: Partial<AnalyseValidee["existants"][number]>) =>
    setAnalyse((a) => (a ? { ...a, existants: a.existants.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : a));

  /** Cases saisies (« C4, D4 ») normalisées ; celles hors grille sont écartées. */
  const lireCases = (texte: string) => {
    if (!grille) return [];
    const sortie: string[] = [];
    for (const c of texte.split(/[\s,;]+/)) {
      const lu = lireCase(grille, c);
      if (lu) { const e = etiquette(lu.colonne, lu.ligne); if (!sortie.includes(e)) sortie.push(e); }
    }
    return sortie;
  };

  const ajouterElement = () => {
    const cases = lireCases(nouvelElement.cases);
    if (!analyse || cases.length === 0) { setErreur("Indiquez au moins une case valide de la grille (ex. C4)."); return; }
    setErreur(null);
    setAnalyse({
      ...analyse,
      existants: [...analyse.existants, {
        nature: nouvelElement.nature, description: "Ajouté par le paysagiste", espece_probable: nouvelElement.espece.trim() || null,
        confiance: "elevee", cases, hauteur_estimee_m: null, recommandation: "conserver",
        ajouterAuPlan: NATURES_VEGETALES.includes(nouvelElement.nature),
      }],
    });
    setNouvelElement({ nature: "arbuste", espece: "", cases: "" });
  };

  // ─── Étape 2 → 3 : analyse validée, puis palette ─────────────────────
  const demanderPalette = async () => {
    if (!compositionId) return;
    setErreur(null);
    setEnCours("L'IA compose la palette végétale…");
    try {
      const r = await fetch(`/api/conception/projets/${projetId}/compositions/${compositionId}/palette`, { method: "POST" })
        .then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
      if (!r.ok) {
        if (r.code === "analyse_non_validee") setErreur(r.error, { libelle: "Revenir à l'analyse", faire: () => { setEtape("analyse"); setErreur(null); } });
        else setErreur(r.error ?? "La proposition de palette a échoué.");
        return;
      }
      setPalette(r.palette);
      setRetenues(r.palette.retenues.map((x: { plante_id: string; raison: string }) => ({ id: x.plante_id, raison: x.raison, actif: true })));
      setAjouts(r.palette.ajouts.map((f: FichePlante & { raison: string; incertitude: string | null }) => ({ fiche: f, actif: true, etat: "attente" as EtatAjout })));
      await chargerBibliotheque();
      setEtape("palette");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La proposition a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const validerAnalyse = async () => {
    if (!compositionId || !analyse || !grille) return;
    setErreur(null);
    setEnCours("Enregistrement de l'analyse…");
    const r = await fetch(`/api/conception/projets/${projetId}/compositions/${compositionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyse_existant: analyse }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
    setEnCours(null);
    if (!r.ok) { setErreur(r.error ?? "Enregistrement impossible."); return; }
    onAnalyseValidee(analyse, grille, contourId);
    await demanderPalette();
  };

  // ─── Ajout à la bibliothèque, plante par plante ──────────────────────
  const ajouterABibliotheque = async () => {
    setErreur(null);
    for (let i = 0; i < ajouts.length; i++) {
      const a = ajouts[i];
      if (!a.actif || a.etat === "prete") continue;
      const maj = (patch: Partial<typeof a>) => setAjouts((liste) => liste.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      try {
        maj({ etat: "creation", erreur: undefined });
        // Fiche sans les champs propres à la proposition (raison, incertitude)
        const fiche = Object.fromEntries(Object.entries(a.fiche).filter(([k]) => k !== "raison" && k !== "incertitude"));
        let id = a.idCree;
        if (!id) {
          const res = await fetch("/api/conception/plantes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fiche),
          });
          const j = await res.json();
          if (res.status === 409 && j.plante_existante?.id) id = j.plante_existante.id;
          else if (!j.ok) throw new Error(j.error ?? "Création impossible.");
          else id = j.id ?? j.plante?.id;
          if (!id) throw new Error("Identifiant de la plante créée introuvable.");
          maj({ idCree: id });
        }
        maj({ etat: "images" });
        const gen = await fetch(`/api/conception/plantes/${id}/generer`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false }));
        if (!gen.ok) throw new Error(gen.error ?? "Génération des images impossible.");
        maj({ etat: "prete" });
      } catch (e) {
        maj({ etat: "erreur", erreur: e instanceof Error ? e.message : "Erreur" });
      }
    }
    await chargerBibliotheque();
  };

  // Plantes finales : bibliothèque retenue + ajouts créés
  const idsFinaux = useMemo(() => {
    const ids = retenues.filter((r) => r.actif).map((r) => r.id);
    for (const a of ajouts) if (a.actif && a.idCree && !ids.includes(a.idCree)) ids.push(a.idCree);
    return ids;
  }, [retenues, ajouts]);

  /** Régénère les images des plantes indiquées (fonction existante, référence de style). */
  const regenererImages = async (plantes: { id: string; nom: string }[]) => {
    setErreur(null);
    for (const pl of plantes) {
      setEnCours(`Génération des images : ${pl.nom}…`);
      const r = await fetch(`/api/conception/plantes/${pl.id}/generer`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false }));
      if (!r.ok) {
        setEnCours(null);
        setErreur(`Les images de ${pl.nom} n'ont pas pu être générées : ${r.error ?? "erreur inconnue"}.`, { libelle: "Réessayer", faire: () => regenererImages(plantes) });
        return;
      }
    }
    setEnCours(null);
    await chargerBibliotheque();
  };

  const ajoutsEnAttente = ajouts.filter((a) => a.actif && a.etat !== "prete").length;
  const sansImages = idsFinaux.filter((id) => { const p = parId.get(id); return !p || !p.face_url || !p.dessus_url; });
  const peutComposer = idsFinaux.length > 0 && ajoutsEnAttente === 0 && sansImages.length === 0;

  // ─── Composition : intention puis placement (par le parent) ──────────
  const composer = async () => {
    if (!compositionId) return;
    setErreur(null);
    setEnCours("L'IA définit l'intention de composition…");
    try {
      const r = await fetch(`/api/conception/projets/${projetId}/compositions/${compositionId}/intention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantes: idsFinaux }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
      if (!r.ok) {
        if (r.code === "images_manquantes") {
          setErreur(`${r.error} Régénérer ?`, { libelle: "Régénérer les images", faire: () => regenererImages(r.plantes) });
        } else if (r.code === "plantes_absentes") {
          setErreur(r.error, { libelle: "Retirer de la palette", faire: () => { setRetenues((l) => l.map((x) => (r.plantes.includes(x.id) ? { ...x, actif: false } : x))); setErreur(null); } });
        } else {
          setErreur(r.error ?? "L'intention de composition a échoué.");
        }
        return;
      }
      onComposer({
        compositionId,
        contourId,
        brief,
        intention: r.intention,
        plantes: idsFinaux.map((id) => parId.get(id)!).filter(Boolean),
        analyse: analyse!,
        grille: grille!,
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'intention a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-center justify-center p-4" data-testid="assistant-composition">
      <div className="bg-paper text-ink rounded shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-hair-light">
          <h2 className="font-medium">Composer avec l&apos;IA</h2>
          <ol className="flex gap-3 text-[0.75rem] text-stone">
            <li className={etape === "brief" ? "text-ink font-medium" : ""}>1 · Brief</li>
            <li className={etape === "analyse" ? "text-ink font-medium" : ""}>2 · Analyse</li>
            <li className={etape === "palette" ? "text-ink font-medium" : ""}>3 · Palette</li>
            <li>4 · Composition</li>
          </ol>
          <button onClick={onFermer} className="ml-auto text-stone hover:text-ink" aria-label="Fermer" data-testid="btn-fermer-composition">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-[0.8rem]">
          {etape === "brief" && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5" data-testid="etape-brief">
              <div className="space-y-3">
                <label className="block">
                  <span className="block mb-1 font-medium">Contour du massif</span>
                  <select className={champ} value={contourId} onChange={(e) => setContourId(e.target.value)} data-testid="choix-contour">
                    {contours.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block mb-1 font-medium">Décrivez le jardin que vous voulez créer</span>
                  <textarea
                    className={`${champ} min-h-[110px]`}
                    value={brief.description}
                    onChange={(e) => majBrief("description", e.target.value)}
                    placeholder="Ex. : un massif naturel et lumineux, graminées et vivaces aux tons blancs et bleus, beau toute l'année, peu d'arrosage."
                    data-testid="brief-description"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="block mb-1">Style</span>
                    <select className={champ} value={brief.style} onChange={(e) => majBrief("style", e.target.value as Brief["style"])} data-testid="brief-style">
                      {STYLES.map((s) => <option key={s} value={s}>{LIBELLES_STYLES[s]}</option>)}
                    </select>
                  </label>
                  {brief.style === "autre" ? (
                    <label>
                      <span className="block mb-1">Préciser le style</span>
                      <input className={champ} value={brief.styleAutre ?? ""} onChange={(e) => majBrief("styleAutre", e.target.value)} />
                    </label>
                  ) : <div />}
                  <label>
                    <span className="block mb-1">Structure</span>
                    <select className={champ} value={brief.structure} onChange={(e) => majBrief("structure", e.target.value as Brief["structure"])} data-testid="brief-structure">
                      <option value="geometrique">Géométrique</option>
                      <option value="libre">Libre</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </label>
                  <label>
                    <span className="block mb-1">Couleurs dominantes</span>
                    <input className={champ} value={couleursTexte} onChange={(e) => setCouleursTexte(e.target.value)} placeholder="blanc, bleu, argent" />
                  </label>
                  <label>
                    <span className="block mb-1">Hauteur minimale (m)</span>
                    <input type="number" step="0.1" min="0" className={champ} value={brief.hauteurMin} onChange={(e) => majBrief("hauteurMin", Number(e.target.value))} />
                  </label>
                  <label>
                    <span className="block mb-1">Hauteur maximale (m)</span>
                    <input type="number" step="0.1" min="0" className={champ} value={brief.hauteurMax} onChange={(e) => majBrief("hauteurMax", Number(e.target.value))} />
                  </label>
                  <label>
                    <span className="block mb-1">Part de persistants : {brief.partPersistants} %</span>
                    <input type="range" min="0" max="100" step="10" className="w-full" value={brief.partPersistants} onChange={(e) => majBrief("partPersistants", Number(e.target.value))} />
                  </label>
                  <label>
                    <span className="block mb-1">Entretien</span>
                    <select className={champ} value={brief.entretien} onChange={(e) => majBrief("entretien", e.target.value as Brief["entretien"])}>
                      <option value="faible">Faible</option><option value="moyen">Moyen</option><option value="eleve">Élevé</option>
                    </select>
                  </label>
                  <label>
                    <span className="block mb-1">Densité</span>
                    <select className={champ} value={brief.densite} onChange={(e) => majBrief("densite", e.target.value as Brief["densite"])}>
                      <option value="serree">Serrée</option><option value="standard">Standard</option><option value="aeree">Aérée</option>
                    </select>
                  </label>
                  <label>
                    <span className="block mb-1">Résistance à la sécheresse</span>
                    <select className={champ} value={brief.secheresse} onChange={(e) => majBrief("secheresse", e.target.value as Brief["secheresse"])}>
                      <option value="normale">Normale</option><option value="elevee">Élevée</option><option value="tres_elevee">Très élevée</option>
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="mb-1">Saisons de floraison</legend>
                  <div className="flex gap-3">
                    {SAISONS.map((s) => (
                      <label key={s} className="flex items-center gap-1">
                        <input type="checkbox" checked={brief.saisons.includes(s)}
                          onChange={() => majBrief("saisons", brief.saisons.includes(s) ? brief.saisons.filter((x) => x !== s) : [...brief.saisons, s])} />
                        {LIBELLES_SAISONS[s]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block">
                  <span className="block mb-1 font-medium">Contexte climatique</span>
                  <textarea className={`${champ} min-h-[60px]`} value={brief.contexteClimatique}
                    onChange={(e) => majBrief("contexteClimatique", e.target.value)} data-testid="brief-climat" />
                </label>
              </div>

              <aside className="bg-paper-2 rounded p-3 space-y-2 h-fit" data-testid="contexte-massif">
                <h3 className="font-medium">Contexte du massif</h3>
                {contexte ? (
                  <ul className="space-y-1.5 text-[0.75rem]">
                    <li><strong>{contexte.surface_m2.toString().replace(".", ",")} m²</strong> · {contexte.longueur_m.toString().replace(".", ",")} × {contexte.largeur_m.toString().replace(".", ",")} m · forme {contexte.forme}</li>
                    <li>Exposition : <strong>{LIBELLES_EXPO[contexte.exposition]}</strong> — {contexte.detailExposition}</li>
                    <li>Pente : {contexte.pente ? `${contexte.pente.pourcent.toString().replace(".", ",")} %, descend vers le ${contexte.pente.descendVers}` : "terrain plat"}</li>
                    <li>{contexte.devant.description.charAt(0).toUpperCase() + contexte.devant.description.slice(1)}</li>
                    <li>Plantes existantes : {contexte.plantesExistantes.length === 0 ? "aucune" : contexte.plantesExistantes.map((p) => p.nom_commun).join(", ")}</li>
                  </ul>
                ) : <p className="text-stone">Choisissez un contour.</p>}
              </aside>
            </div>
          )}

          {etape === "analyse" && analyse && grille && (
            <div className="space-y-4" data-testid="etape-analyse">
              {analyseReutilisee && (
                <p className="rounded bg-paper-2 px-3 py-2 text-[0.75rem]" data-testid="analyse-reutilisee">
                  Analyse enregistrée réutilisée : le contour, les vues calées et l&apos;existant n&apos;ont pas changé.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[0.78rem]">
                <p><strong>Style existant :</strong> {analyse.style_existant}</p>
                <p><strong>Ambiance :</strong> {analyse.ambiance}</p>
                <p><strong>Premier plan :</strong> {analyse.premier_plan}</p>
                <p><strong>Fond :</strong> {analyse.fond}</p>
                <p><strong>Ombre :</strong> {analyse.ombre_lumiere.ombre.map((z) => `${z.cases.join(" ")} (${z.description})`).join(" ; ") || "aucune observée"}</p>
                <p><strong>Lumière :</strong> {analyse.ombre_lumiere.lumiere.map((z) => `${z.cases.join(" ")} (${z.description})`).join(" ; ") || "—"}</p>
              </div>
              {analyse.remarques && <p className="text-stone text-[0.75rem]">{analyse.remarques}</p>}

              <h3 className="font-medium">Existant identifié</h3>
              <p className="text-stone text-[0.72rem]">Les éléments de cette liste sont conservés : le placement évite leurs cases. Corrigez l&apos;espèce, retirez ou ajoutez un élément.</p>
              <ul className="space-y-2">
                {analyse.existants.map((e, i) => (
                  <li key={i} className="rounded border border-hair-light p-2 grid grid-cols-1 md:grid-cols-[130px_1fr_150px_auto] gap-2 items-center" data-testid="existant">
                    <select className={champ} value={e.nature} onChange={(ev) => majExistant(i, { nature: ev.target.value as NatureExistant })} aria-label="Nature">
                      {NATURES_EXISTANT.map((n) => <option key={n} value={n}>{LIBELLES_NATURES[n]}</option>)}
                    </select>
                    <div className="min-w-0">
                      <input className={champ} value={e.espece_probable ?? ""} placeholder="Espèce (inconnue)"
                        onChange={(ev) => majExistant(i, { espece_probable: ev.target.value || null })} data-testid="existant-espece" aria-label="Espèce" />
                      <p className="text-[0.7rem] text-stone mt-0.5 truncate">
                        {e.description} · {LIBELLES_CONFIANCE[e.confiance]} · {e.recommandation === "conserver" ? "à conserver" : "à évaluer"}
                        {e.hauteur_estimee_m ? ` · ≈ ${String(e.hauteur_estimee_m).replace(".", ",")} m` : ""}
                      </p>
                    </div>
                    <input className={champ} defaultValue={e.cases.join(" ")} aria-label="Cases"
                      onBlur={(ev) => { const c = lireCases(ev.target.value); if (c.length > 0) majExistant(i, { cases: c }); else ev.target.value = e.cases.join(" "); }} />
                    <div className="flex items-center gap-2 text-[0.72rem]">
                      {NATURES_VEGETALES.includes(e.nature) && (
                        <label className="flex items-center gap-1 whitespace-nowrap">
                          <input type="checkbox" checked={e.ajouterAuPlan} onChange={(ev) => majExistant(i, { ajouterAuPlan: ev.target.checked })} data-testid="existant-ajouter-plan" />
                          Ajouter au plan
                        </label>
                      )}
                      <button className={boutonSecondaire} onClick={() => setAnalyse({ ...analyse, existants: analyse.existants.filter((_, j) => j !== i) })} data-testid="existant-retirer">
                        Retirer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-hair-light p-2" data-testid="existant-nouveau">
                <select className={champBase} value={nouvelElement.nature} onChange={(e) => setNouvelElement({ ...nouvelElement, nature: e.target.value as NatureExistant })} aria-label="Nature du nouvel élément">
                  {NATURES_EXISTANT.map((n) => <option key={n} value={n}>{LIBELLES_NATURES[n]}</option>)}
                </select>
                <input className={`${champBase} w-48`} placeholder="Espèce (facultatif)" value={nouvelElement.espece} onChange={(e) => setNouvelElement({ ...nouvelElement, espece: e.target.value })} aria-label="Espèce du nouvel élément" />
                <input className={`${champBase} w-36`} placeholder="Cases (ex. C4 D4)" value={nouvelElement.cases} onChange={(e) => setNouvelElement({ ...nouvelElement, cases: e.target.value })} aria-label="Cases du nouvel élément" data-testid="existant-nouveau-cases" />
                <button className={boutonSecondaire} onClick={ajouterElement} data-testid="existant-ajouter">Ajouter un élément</button>
              </div>
            </div>
          )}

          {etape === "palette" && palette && (
            <div className="space-y-4" data-testid="etape-palette">
              {palette.remarques && <p className="text-stone">{palette.remarques}</p>}
              <h3 className="font-medium">Plantes de la bibliothèque</h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {retenues.map((r, i) => {
                  const p = parId.get(r.id);
                  return (
                    <li key={`${r.id}-${i}`} className={`flex gap-3 rounded border border-hair-light p-2 ${r.actif ? "" : "opacity-50"}`} data-testid="palette-retenue">
                      {p?.face_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/conception/plantes/${p.id}/image/face?v=${encodeURIComponent(p.updated_at ?? "")}`} alt="" className="w-12 h-12 object-contain shrink-0" />
                        : <div className="w-12 h-12 bg-paper-2 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p?.nom_commun ?? r.id}</p>
                        <p className="italic text-stone truncate">{p?.nom_latin}</p>
                        <p className="text-[0.72rem] mt-0.5">{r.raison}</p>
                        <div className="flex gap-2 mt-1">
                          <button className={boutonSecondaire} onClick={() => setRetenues((l) => l.map((x, j) => (j === i ? { ...x, actif: !x.actif } : x)))}>
                            {r.actif ? "Retirer" : "Retenir"}
                          </button>
                          <select className="border border-hair-light rounded text-[0.72rem] bg-paper" value=""
                            onChange={(e) => { const v = e.target.value; if (v) setRetenues((l) => l.map((x, j) => (j === i ? { ...x, id: v, raison: "Remplacement choisi par le paysagiste", actif: true } : x))); }}
                            aria-label="Remplacer par">
                            <option value="">Remplacer par…</option>
                            {bibliotheque.filter((b) => b.face_url).map((b) => <option key={b.id} value={b.id}>{b.nom_commun} ({b.nom_latin})</option>)}
                          </select>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {ajouts.length > 0 && (
                <>
                  <h3 className="font-medium">Plantes à ajouter à la bibliothèque</h3>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ajouts.map((a, i) => (
                      <li key={a.fiche.nom_latin} className={`rounded border border-hair-light p-2 ${a.actif ? "" : "opacity-50"}`} data-testid="palette-ajout">
                        <p className="font-medium">{a.fiche.nom_commun} <span className="italic text-stone font-normal">{a.fiche.nom_latin}</span></p>
                        <p className="text-[0.72rem] text-stone">
                          {a.fiche.hauteur_adulte_m} × {a.fiche.largeur_adulte_m} m · {a.fiche.feuillage} · eau {a.fiche.besoin_eau} · sécheresse {a.fiche.resistance_secheresse.replace("_", " ")}
                        </p>
                        <p className="text-[0.72rem] mt-0.5">{a.fiche.raison}</p>
                        {a.fiche.incertitude && <p className="text-[0.72rem] text-amber-700 mt-0.5">Incertitude : {a.fiche.incertitude}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <button className={boutonSecondaire} disabled={a.etat === "creation" || a.etat === "images"}
                            onClick={() => setAjouts((l) => l.map((x, j) => (j === i ? { ...x, actif: !x.actif } : x)))}>
                            {a.actif ? "Retirer" : "Retenir"}
                          </button>
                          <span className="text-[0.72rem]" data-testid="etat-ajout">
                            {{ attente: "", creation: "Création de la fiche…", images: "Génération des images…", prete: "✓ Ajoutée", erreur: `Erreur : ${a.erreur ?? ""}` }[a.etat]}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button className={bouton} onClick={ajouterABibliotheque} disabled={ajoutsEnAttente === 0 || enCours !== null}
                    data-testid="btn-ajouter-bibliotheque">
                    Ajouter à la bibliothèque ({ajoutsEnAttente})
                  </button>
                </>
              )}
            </div>
          )}



        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-hair-light">
          {etape === "analyse" && (
            <>
              <button className={boutonSecondaire} onClick={() => setEtape("brief")} disabled={enCours !== null}>← Brief</button>
              <button className={boutonSecondaire} onClick={() => analyser(true)} disabled={enCours !== null} data-testid="btn-refaire-analyse">Refaire l&apos;analyse</button>
            </>
          )}
          {etape === "palette" && (
            <>
              <button className={boutonSecondaire} onClick={() => setEtape("analyse")} disabled={enCours !== null}>← Analyse</button>
              <button className={boutonSecondaire} onClick={demanderPalette} disabled={enCours !== null} data-testid="btn-nouvelle-palette">Nouvelle palette</button>
            </>
          )}
          <div className="flex-1 text-[0.72rem] text-stone">
            {erreur ? (
              <span className="flex flex-wrap items-center gap-2 text-red-700" role="alert" data-testid="erreur-composition">
                <span>{erreur.message}</span>
                {erreur.action && (
                  <button className={boutonSecondaire} onClick={erreur.action.faire} disabled={enCours !== null} data-testid="btn-action-erreur">
                    {erreur.action.libelle}
                  </button>
                )}
              </span>
            ) : enCours ? (
              <span aria-live="polite" data-testid="composition-en-cours">… {enCours}</span>
            ) : null}
            {!erreur && !enCours && etape === "brief" && sansVue && (
              <span className="text-red-700" data-testid="message-sans-vue">Calez d&apos;abord au moins une vue qui montre le massif.</span>
            )}
            {!erreur && !enCours && etape === "brief" && preparation && !sansVue && (
              <span>Vues analysées : {preparation.vues.map((v) => v.nom + (v.principale ? " (principale)" : "")).join(", ")}</span>
            )}
            {!erreur && !enCours && etape === "palette" && !peutComposer && (
              ajoutsEnAttente > 0 ? "Ajoutez d'abord les nouvelles plantes à la bibliothèque (ou retirez-les)."
                : sansImages.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-2 text-red-700" data-testid="message-sans-images">
                    {(() => {
                      const noms = sansImages.map((id) => parId.get(id)?.nom_commun ?? "Une plante");
                      return `${noms.join(", ")} ${noms.length > 1 ? "n'ont" : "n'a"} pas d'image. Régénérer ?`;
                    })()}
                    <button className={boutonSecondaire} data-testid="btn-regenerer-images"
                      onClick={() => regenererImages(sansImages.filter((id) => parId.has(id)).map((id) => ({ id, nom: parId.get(id)!.nom_commun })))}>
                      Régénérer les images
                    </button>
                  </span>
                )
                  : idsFinaux.length === 0 ? "Retenez au moins une plante." : ""
            )}
          </div>
          {etape === "brief" ? (
            <button className={bouton} onClick={() => analyser(false)} disabled={!contexte || !preparation || sansVue || enCours !== null} data-testid="btn-analyser">
              Analyser les vues
            </button>
          ) : etape === "analyse" ? (
            <button className={bouton} onClick={validerAnalyse} disabled={enCours !== null} data-testid="btn-valider-analyse">
              Valider l&apos;analyse
            </button>
          ) : (
            <button className={bouton} onClick={composer} disabled={!peutComposer || enCours !== null} data-testid="btn-composer">
              Composer le massif
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
