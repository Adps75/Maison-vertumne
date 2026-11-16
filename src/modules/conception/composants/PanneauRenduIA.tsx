"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PointDeVue } from "../camera/types";
import type { CaptureurRendu } from "../scene3d/capture-rendu";
import { versPng } from "../scene3d/capture-rendu";
import type { DonneesScene3D } from "../scene3d/types";
import type { Element } from "../types";
import type { Pt } from "../geo/plan";
import { creerProjecteur } from "../camera/projection";
import { tailleModele } from "../rendu/recadrage";
import { estimerCoutEdition, formaterEuros } from "../rendu/cout";
import {
  STYLES, LIBELLES_STYLES, DESCRIPTIONS_STYLES, MAX_REFERENCES, MENTION_DESSIN_IA, estDessine, plantesPrincipales,
  type StyleHistorique, type StyleProjet,
} from "../rendu/styles";
import { decrireMateriaux, type Materiau, type ProjeterVue } from "../materiaux/materiaux";
import { dessinerMention, telechargerCanvas } from "../rendu/mention";

interface Rendu {
  id: string;
  style: StyleHistorique;
  cout: number;
  created_at: string;
  references_utilisees?: { id: string }[];
  consignes_sup?: string | null;
}

const ETAPES = [
  { cle: "preparation", libelle: "Préparation de la vue" },
  { cle: "envoi", libelle: "Envoi" },
  { cle: "generation", libelle: "Génération et assemblage" },
] as const;
type Etape = (typeof ETAPES)[number]["cle"];

interface Props {
  pdv: PointDeVue;
  captureRef: React.MutableRefObject<CaptureurRendu | null>;
  donnees: DonneesScene3D;
  elements: Map<string, Element>;
  materiaux: Materiau[];
  altitudeEn: (x: number, y: number) => number;
  /** Style du projet (le même pour toutes les vues) et option annotations. */
  style: StyleProjet;
  annotations: boolean;
  onChangerStyle: (style: StyleProjet, annotations: boolean) => void;
  onFermer: () => void;
}

/** Laisse le navigateur afficher la progression avant un calcul bloquant. */
const prochaineImage = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const centre = (pts: Pt[]): Pt | null =>
  pts.length === 0 ? null : [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

export function PanneauRenduIA({ pdv, captureRef, donnees, elements, materiaux, altitudeEn, style, annotations, onChangerStyle, onFermer }: Props) {
  const base = `/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/rendus`;
  const [rendus, setRendus] = useState<Rendu[]>([]);
  const [references, setReferences] = useState<Record<string, { id: string }[]>>({});
  const [consignesSup, setConsignesSup] = useState("");
  const [enCours, setEnCours] = useState<{ style: StyleProjet; etape: Etape; debut: number } | null>(null);
  const [secondes, setSecondes] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [depot, setDepot] = useState(false);
  const [passesMateriaux, setPassesMateriaux] = useState(false);

  const refsStyle = references[style] ?? [];
  // Coût estimé : taille d'envoi au modèle (la vue entière est le cas le plus coûteux), références comprises
  const tailleVue = tailleModele(pdv.largeur_px, pdv.hauteur_px);
  const coutVue = estimerCoutEdition(tailleVue.largeur, tailleVue.hauteur, refsStyle.length);

  const charger = useCallback(async () => {
    const r = await fetch(base).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRendus(r.rendus);
  }, [base]);

  const chargerReferences = useCallback(async () => {
    const r = await fetch("/api/conception/styles/references").then((x) => x.json()).catch(() => null);
    if (r?.ok) setReferences(r.references);
  }, []);

  useEffect(() => {
    let actif = true;
    fetch(base).then((x) => x.json()).then((r) => { if (actif && r?.ok) setRendus(r.rendus); }).catch(() => {});
    fetch("/api/conception/styles/references").then((x) => x.json()).then((r) => { if (actif && r?.ok) setReferences(r.references); }).catch(() => {});
    return () => { actif = false; };
  }, [base]);

  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setSecondes(Math.round((Date.now() - enCours.debut) / 1000)), 500);
    return () => clearInterval(t);
  }, [enCours]);

  /** Contexte propre à la vue : matériaux visibles (position par rapport au massif) et plantes principales. */
  const contexteVue = useMemo(() => {
    const projecteur = creerProjecteur(pdv.camera, altitudeEn, pdv.largeur_px, pdv.hauteur_px);
    const dansCadre = (p: Pt, h = 0.3) => {
      const e = projecteur(p, altitudeEn(p[0], p[1]) + h);
      return e && e.u >= 0 && e.u <= 1 && e.v >= 0 && e.v <= 1 ? e : null;
    };
    const projeter: ProjeterVue = (p) => {
      const e = dansCadre(p, 0);
      return e ? { u: e.u, distance: Math.hypot(p[0] - pdv.camera.x, p[1] - pdv.camera.y) } : null;
    };
    const visibles = donnees.vegetaux.filter((v) => dansCadre(v.position, v.hauteur_m / 2));
    const massif = donnees.zoneContour ? centre(donnees.zoneContour) : centre(visibles.map((v) => v.position));
    return {
      materiaux: decrireMateriaux(elements.values(), materiaux, massif, projeter),
      plantes: plantesPrincipales(visibles.map((v) => v.nom ?? "")),
    };
  }, [pdv.camera, pdv.largeur_px, pdv.hauteur_px, altitudeEn, donnees.vegetaux, donnees.zoneContour, elements, materiaux]);

  // Matériaux visibles dans la vue : une passe chacun avec l'option (coût en plus, au plus une vue entière)
  const nbMateriauxVue = new Set(contexteVue.materiaux.map((m) => m.nom)).size;
  const coutPasses = passesMateriaux ? nbMateriauxVue * estimerCoutEdition(tailleVue.largeur, tailleVue.hauteur, refsStyle.length) : 0;

  const generer = useCallback(async () => {
    setErreur(null);
    setSecondes(0);
    const debut = Date.now();
    setEnCours({ style, etape: "preparation", debut });
    try {
      await prochaineImage();
      const capturer = captureRef.current;
      if (!capturer) throw new Error("La vue 3D n'est pas prête.");
      const cap = capturer(pdv.largeur_px, pdv.hauteur_px);
      const couchePng = await versPng(cap.couche, cap.largeur, cap.hauteur);
      const cartePng = await versPng(cap.carte, cap.largeur, cap.hauteur);
      const masquePng = style === "realiste" ? await versPng(cap.masqueScene, cap.largeur, cap.hauteur) : null;

      setEnCours({ style, etape: "envoi", debut });
      const prep = await fetch(`${base}/preparer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style }),
      }).then((x) => x.json());
      if (!prep.ok) throw new Error(prep.error ?? "Préparation impossible.");

      const stockage = createClient().storage.from("conception");
      const envoi1 = await stockage.uploadToSignedUrl(prep.couche.path, prep.couche.token, couchePng, { contentType: "image/png" });
      if (envoi1.error) throw new Error(envoi1.error.message);
      if (prep.carte) {
        const envoiCarte = await stockage.uploadToSignedUrl(prep.carte.path, prep.carte.token, cartePng, { contentType: "image/png" });
        if (envoiCarte.error) throw new Error(envoiCarte.error.message);
      }
      if (masquePng && prep.masqueScene) {
        const envoi2 = await stockage.uploadToSignedUrl(prep.masqueScene.path, prep.masqueScene.token, masquePng, { contentType: "image/png" });
        if (envoi2.error) throw new Error(envoi2.error.message);
      }

      setEnCours({ style, etape: "generation", debut });
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renduId: prep.renduId, style, annotations: annotations && style === "croquis", consignesSup: consignesSup.trim(),
          materiaux: contexteVue.materiaux, plantesPrincipales: contexteVue.plantes,
          passesMateriaux: passesMateriaux && nbMateriauxVue > 0,
        }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
      if (!res.ok) throw new Error(res.error ?? "La génération a échoué.");
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La génération a échoué.");
    } finally {
      setEnCours(null);
    }
  }, [base, captureRef, charger, pdv.largeur_px, pdv.hauteur_px, style, annotations, consignesSup, contexteVue, passesMateriaux, nbMateriauxVue]);

  const deposerReference = useCallback(async (fichier: File) => {
    setErreur(null);
    setDepot(true);
    const form = new FormData();
    form.append("image", fichier);
    const r = await fetch(`/api/conception/styles/${style}/references`, { method: "POST", body: form })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
    setDepot(false);
    if (!r.ok) setErreur(r.error ?? "Dépôt impossible.");
    await chargerReferences();
  }, [style, chargerReferences]);

  const retirerReference = useCallback(async (id: string) => {
    const r = await fetch(`/api/conception/styles/references/${id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) setErreur(r?.error ?? "Retrait impossible.");
    await chargerReferences();
  }, [chargerReferences]);

  const telecharger = useCallback(async (r: Rendu) => {
    const blob = await fetch(`${base}/${r.id}/image`).then((x) => x.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    dessinerMention(ctx, canvas.width, canvas.height);
    const nom = `${pdv.nom || "vue"} - ${LIBELLES_STYLES[r.style]}.png`.replace(/[\\/:*?"<>|]/g, "-");
    await telechargerCanvas(canvas, nom);
  }, [base, pdv.nom]);

  const supprimer = useCallback(async (id: string) => {
    if (aConfirmer !== id) {
      setAConfirmer(id);
      setTimeout(() => setAConfirmer((c) => (c === id ? null : c)), 4000);
      return;
    }
    setAConfirmer(null);
    const r = await fetch(`${base}/${id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) setErreur(r?.error ?? "Suppression impossible.");
    await charger();
  }, [aConfirmer, base, charger]);

  const occupe = enCours !== null;
  const bouton = "bg-brass hover:bg-brass-soft text-paper rounded px-3 py-1.5 text-[0.75rem] disabled:opacity-50 disabled:cursor-not-allowed";
  const boutonSecondaire = "rounded px-2.5 py-1 border border-hair-light hover:bg-paper-2 text-[0.72rem]";

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[380px] max-w-full bg-paper text-ink shadow-xl z-30 flex flex-col" data-testid="panneau-rendu-ia">
      <div className="flex items-center px-4 py-3 border-b border-hair-light">
        <h3 className="font-medium text-[0.9rem]">Rendu IA</h3>
        <button onClick={onFermer} className="ml-auto text-stone hover:text-ink" aria-label="Fermer" data-testid="btn-fermer-rendu">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-[0.78rem]">
        {/* Style du projet : le même pour toutes les vues */}
        <p className="font-medium mb-1">Style du projet</p>
        <p className="text-stone text-[0.72rem] mb-2">Appliqué à toutes les vues du projet, avec les mêmes images de référence.</p>
        <div className="space-y-1.5 mb-3" role="radiogroup" aria-label="Style du rendu" data-testid="choix-style">
          {STYLES.map((s) => (
            <label key={s} className={`flex gap-2 rounded border p-2 cursor-pointer ${style === s ? "border-brass bg-paper-2" : "border-hair-light hover:bg-paper-2"}`} data-testid={`style-${s}`}>
              <input type="radio" name="style-rendu" className="mt-0.5 accent-[#9C7C3C]" checked={style === s} disabled={occupe}
                onChange={() => onChangerStyle(s, annotations)} />
              <span>
                <span className="font-medium">{LIBELLES_STYLES[s]}</span>
                {s === "croquis" && <span className="text-stone"> (par défaut)</span>}
                <span className="block text-stone text-[0.72rem]">{DESCRIPTIONS_STYLES[s]}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Images de référence du style (communes à l'atelier) */}
        <div className="rounded border border-hair-light p-2.5 mb-3" data-testid="references-style">
          <p className="font-medium mb-1">Images de référence · {LIBELLES_STYLES[style]}</p>
          <p className="text-stone text-[0.72rem] mb-2">
            1 à {MAX_REFERENCES} images, communes à l&apos;atelier : l&apos;IA reprend leur style sans en copier le contenu.
          </p>
          <div className="flex flex-wrap gap-2 items-start">
            {refsStyle.map((r) => (
              <div key={r.id} className="w-[88px]" data-testid={`reference-${r.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/conception/styles/references/${r.id}/image`} alt="Image de référence" className="w-[88px] h-[66px] object-cover rounded border border-hair-light bg-paper-2" />
                <button className={`${boutonSecondaire} mt-1 w-full`} disabled={occupe} onClick={() => retirerReference(r.id)} data-testid="btn-retirer-reference">Retirer</button>
              </div>
            ))}
            {refsStyle.length < MAX_REFERENCES && (
              <label className={`w-[88px] h-[66px] rounded border border-dashed border-hair flex items-center justify-center text-center text-[0.7rem] text-stone ${depot || occupe ? "opacity-50" : "cursor-pointer hover:bg-paper-2"}`}>
                {depot ? "Envoi…" : "+ Ajouter une image"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={depot || occupe} data-testid="input-reference"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) deposerReference(f); }} />
              </label>
            )}
          </div>
        </div>

        {style === "croquis" && (
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={annotations} disabled={occupe} onChange={(e) => onChangerStyle(style, e.target.checked)} data-testid="option-annotations" />
            Annotations : noms des plantes principales écrits à la main, avec une flèche
          </label>
        )}

        <label className="block mb-1 font-medium" htmlFor="consignes-sup">Consignes supplémentaires</label>
        <textarea id="consignes-sup" className="w-full border border-hair-light rounded px-2 py-1.5 bg-white text-[0.78rem] mb-1" rows={2} maxLength={500}
          placeholder="Ambiance, saison, lumière… (ex. fin d'été, lumière douce du soir)" value={consignesSup}
          onChange={(e) => setConsignesSup(e.target.value)} data-testid="consignes-sup" />
        <p className="text-stone text-[0.7rem] mb-3">Sans effet sur le plan ni les quantités.</p>

        {contexteVue.materiaux.length > 0 && (
          <p className="text-stone text-[0.72rem] mb-2" data-testid="materiaux-rendu">
            Matériaux dessinés sur la vue et envoyés avec leur carte : {[...new Set(contexteVue.materiaux.map((m) => m.nom))].join(", ")}
          </p>
        )}

        {nbMateriauxVue > 0 && (
          <label className="flex items-start gap-2 mb-3">
            <input type="checkbox" className="mt-0.5" checked={passesMateriaux} disabled={occupe} onChange={(e) => setPassesMateriaux(e.target.checked)} data-testid="option-passes" />
            <span>
              Précision maximale : une passe par matériau ({nbMateriauxVue}), limitée à sa zone
              <span className="block text-stone text-[0.72rem]">Si un matériau déborde encore. Coût en plus : jusqu&apos;à {formaterEuros(nbMateriauxVue * estimerCoutEdition(tailleVue.largeur, tailleVue.hauteur, refsStyle.length))}.</span>
            </span>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button className={bouton} disabled={occupe || depot} onClick={generer} data-testid="btn-generer">Générer</button>
          <span className="text-stone" data-testid="cout-estime">{style === "realiste" || passesMateriaux ? "Jusqu'à " : "≈ "}{formaterEuros(coutVue + coutPasses)}</span>
        </div>
        {estDessine(style) && <p className="text-brass mt-1" data-testid="mention-dessin-ia">{MENTION_DESSIN_IA}</p>}

        {/* Progression */}
        {enCours && (
          <div className="mt-3 rounded border border-hair-light p-3" data-testid="progression-rendu" aria-live="polite">
            <p className="font-medium mb-2">{LIBELLES_STYLES[enCours.style]} · {secondes} s</p>
            <ol className="space-y-1">
              {ETAPES.map((e, i) => {
                const courante = ETAPES.findIndex((x) => x.cle === enCours.etape);
                return (
                  <li key={e.cle} className={i < courante ? "text-stone" : i === courante ? "text-ink font-medium" : "text-stone/60"}>
                    {i < courante ? "✓" : i === courante ? "…" : "·"} {e.libelle}
                  </li>
                );
              })}
            </ol>
            <div className="mt-2 h-1 bg-paper-2 rounded overflow-hidden">
              <div className="h-full bg-brass animate-pulse" style={{ width: `${((ETAPES.findIndex((x) => x.cle === enCours.etape) + 1) / ETAPES.length) * 100}%` }} />
            </div>
          </div>
        )}

        {erreur && <p className="mt-3 text-brass font-medium" role="alert" data-testid="erreur-rendu">{erreur}</p>}

        {/* Rendus de la vue */}
        <h4 className="mt-5 mb-2 font-medium">Rendus de cette vue</h4>
        {rendus.length === 0 ? (
          <p className="text-stone">Aucun rendu pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3" data-testid="liste-rendus">
            {rendus.map((r) => (
              <li key={r.id} className="rounded border border-hair-light overflow-hidden" data-testid={`rendu-${r.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/${r.id}/image`} alt={`Rendu ${LIBELLES_STYLES[r.style]}`} className="w-full block bg-paper-2" />
                <div className="p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{LIBELLES_STYLES[r.style]}</span>
                    <span className="text-stone">{Number(r.cout) > 0 ? formaterEuros(Number(r.cout)) : "Gratuit"}</span>
                    <span className="text-stone ml-auto">{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  {r.style !== "realiste" && r.style !== "dessin_filtre" && <p className="text-brass mt-1">{MENTION_DESSIN_IA}</p>}
                  {(r.references_utilisees?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-stone" data-testid="trace-references">
                      Références :
                      {r.references_utilisees!.map((x) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={x.id} src={`/api/conception/styles/references/${x.id}/image`} alt="" className="w-7 h-5 object-cover rounded border border-hair-light" />
                      ))}
                    </div>
                  )}
                  {r.consignes_sup && <p className="text-stone mt-1 italic">« {r.consignes_sup} »</p>}
                  <div className="flex gap-2 mt-2">
                    <button className={bouton} onClick={() => telecharger(r)} data-testid="btn-telecharger-rendu">Télécharger</button>
                    <button className="rounded px-3 py-1.5 border border-hair-light hover:bg-paper-2" onClick={() => supprimer(r.id)} data-testid="btn-supprimer-rendu">
                      {aConfirmer === r.id ? "Confirmer la suppression" : "Supprimer"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
