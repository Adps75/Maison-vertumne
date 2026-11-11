"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PointDeVue } from "../camera/types";
import type { CaptureurRendu } from "../scene3d/capture-rendu";
import { versPng } from "../scene3d/capture-rendu";
import { tailleModele } from "../rendu/recadrage";
import { estimerCoutEdition, formaterEuros } from "../rendu/cout";
import { MENTION_DESSIN_IA } from "../rendu/consignes";
import { dessinerMention, telechargerCanvas } from "../rendu/mention";

type Style = "realiste" | "dessin_filtre" | "dessin_ia";

interface Rendu {
  id: string;
  style: Style;
  cout: number;
  created_at: string;
}

const LIBELLES: Record<Style, string> = {
  realiste: "Réaliste",
  dessin_filtre: "Dessin (filtre)",
  dessin_ia: "Dessin (IA)",
};

const ETAPES = [
  { cle: "preparation", libelle: "Préparation de la vue" },
  { cle: "envoi", libelle: "Envoi" },
  { cle: "generation", libelle: "Génération et assemblage" },
] as const;
type Etape = (typeof ETAPES)[number]["cle"];

interface Props {
  pdv: PointDeVue;
  captureRef: React.MutableRefObject<CaptureurRendu | null>;
  onFermer: () => void;
}

/** Laisse le navigateur afficher la progression avant un calcul bloquant. */
const prochaineImage = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function PanneauRenduIA({ pdv, captureRef, onFermer }: Props) {
  const base = `/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/rendus`;
  const [onglet, setOnglet] = useState<"realiste" | "dessin">("realiste");
  const [rendus, setRendus] = useState<Rendu[]>([]);
  const [enCours, setEnCours] = useState<{ style: Style; etape: Etape; debut: number } | null>(null);
  const [secondes, setSecondes] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  // Coût estimé : taille d'envoi au modèle (la vue entière est le cas le plus coûteux)
  const tailleVue = tailleModele(pdv.largeur_px, pdv.hauteur_px);
  const coutVue = estimerCoutEdition(tailleVue.largeur, tailleVue.hauteur);

  const charger = useCallback(async () => {
    const r = await fetch(base).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRendus(r.rendus);
  }, [base]);

  useEffect(() => {
    let actif = true;
    fetch(base)
      .then((x) => x.json())
      .then((r) => { if (actif && r?.ok) setRendus(r.rendus); })
      .catch(() => {});
    return () => { actif = false; };
  }, [base]);

  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setSecondes(Math.round((Date.now() - enCours.debut) / 1000)), 500);
    return () => clearInterval(t);
  }, [enCours]);

  const generer = useCallback(async (style: Style) => {
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
      if (masquePng && prep.masqueScene) {
        const envoi2 = await stockage.uploadToSignedUrl(prep.masqueScene.path, prep.masqueScene.token, masquePng, { contentType: "image/png" });
        if (envoi2.error) throw new Error(envoi2.error.message);
      }

      setEnCours({ style, etape: "generation", debut });
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renduId: prep.renduId, style }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "Le serveur n'a pas répondu." }));
      if (!res.ok) throw new Error(res.error ?? "La génération a échoué.");
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La génération a échoué.");
    } finally {
      setEnCours(null);
    }
  }, [base, captureRef, charger, pdv.largeur_px, pdv.hauteur_px]);

  const telecharger = useCallback(async (r: Rendu) => {
    const blob = await fetch(`${base}/${r.id}/image`).then((x) => x.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    dessinerMention(ctx, canvas.width, canvas.height);
    const nom = `${pdv.nom || "vue"} - ${LIBELLES[r.style]}.png`.replace(/[\\/:*?"<>|]/g, "-");
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

  return (
    <div
      className="absolute top-0 right-0 bottom-0 w-[360px] max-w-full bg-paper text-ink shadow-xl z-30 flex flex-col"
      data-testid="panneau-rendu-ia"
    >
      <div className="flex items-center px-4 py-3 border-b border-hair-light">
        <h3 className="font-medium text-[0.9rem]">Rendu IA</h3>
        <button onClick={onFermer} className="ml-auto text-stone hover:text-ink" aria-label="Fermer" data-testid="btn-fermer-rendu">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-[0.78rem]">
        {/* Choix du style */}
        <div className="flex rounded border border-hair-light overflow-hidden mb-3" role="tablist">
          {(["realiste", "dessin"] as const).map((o) => (
            <button
              key={o}
              role="tab"
              aria-selected={onglet === o}
              onClick={() => setOnglet(o)}
              className={`flex-1 py-1.5 ${onglet === o ? "bg-brass text-paper" : "hover:bg-paper-2"}`}
              data-testid={`onglet-${o}`}
            >
              {o === "realiste" ? "Réaliste" : "Dessin"}
            </button>
          ))}
        </div>

        {onglet === "realiste" ? (
          <div className="rounded border border-hair-light p-3" data-testid="choix-realiste">
            <p className="mb-2">
              Intègre les végétaux au massif : lumière, ombres, contact au sol, paillage.
              <strong> Seul le massif est modifié</strong> ; le reste de la photo est conservé à l&apos;identique.
            </p>
            <p className="text-stone mb-3" data-testid="cout-estime-realiste">
              Coût estimé : jusqu&apos;à {formaterEuros(coutVue)}
            </p>
            <button className={bouton} disabled={occupe} onClick={() => generer("realiste")} data-testid="btn-generer-realiste">
              Générer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2" data-testid="choix-dessin">
            <div className="rounded border border-hair-light p-3 flex flex-col">
              <p className="font-medium mb-1">A · Filtre dessin</p>
              <p className="text-stone mb-2 flex-1">Contours, aplats, lavis. Sans IA, fidèle à 100 %.</p>
              <p className="text-stone mb-2" data-testid="cout-estime-dessin-filtre">Gratuit</p>
              <button className={bouton} disabled={occupe} onClick={() => generer("dessin_filtre")} data-testid="btn-generer-dessin-filtre">
                Générer
              </button>
            </div>
            <div className="rounded border border-hair-light p-3 flex flex-col">
              <p className="font-medium mb-1">B · Illustration IA</p>
              <p className="text-stone mb-1 flex-1">Aquarelle et encre, éléments et positions conservés.</p>
              <p className="text-amber-700 mb-1" data-testid="mention-dessin-ia">{MENTION_DESSIN_IA}</p>
              <p className="text-stone mb-2" data-testid="cout-estime-dessin-ia">≈ {formaterEuros(coutVue)}</p>
              <button className={bouton} disabled={occupe} onClick={() => generer("dessin_ia")} data-testid="btn-generer-dessin-ia">
                Générer
              </button>
            </div>
          </div>
        )}

        {/* Progression */}
        {enCours && (
          <div className="mt-3 rounded border border-hair-light p-3" data-testid="progression-rendu" aria-live="polite">
            <p className="font-medium mb-2">{LIBELLES[enCours.style]} · {secondes} s</p>
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

        {erreur && (
          <p className="mt-3 text-red-700" role="alert" data-testid="erreur-rendu">{erreur}</p>
        )}

        {/* Rendus de la vue */}
        <h4 className="mt-5 mb-2 font-medium">Rendus de cette vue</h4>
        {rendus.length === 0 ? (
          <p className="text-stone">Aucun rendu pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3" data-testid="liste-rendus">
            {rendus.map((r) => (
              <li key={r.id} className="rounded border border-hair-light overflow-hidden" data-testid={`rendu-${r.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/${r.id}/image`} alt={`Rendu ${LIBELLES[r.style]}`} className="w-full block bg-paper-2" />
                <div className="p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{LIBELLES[r.style]}</span>
                    <span className="text-stone">
                      {Number(r.cout) > 0 ? formaterEuros(Number(r.cout)) : "Gratuit"}
                    </span>
                    <span className="text-stone ml-auto">
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {r.style === "dessin_ia" && <p className="text-amber-700 mt-1">{MENTION_DESSIN_IA}</p>}
                  <div className="flex gap-2 mt-2">
                    <button className={bouton} onClick={() => telecharger(r)} data-testid="btn-telecharger-rendu">
                      Télécharger
                    </button>
                    <button
                      className="rounded px-3 py-1.5 border border-hair-light hover:bg-paper-2"
                      onClick={() => supprimer(r.id)}
                      data-testid="btn-supprimer-rendu"
                    >
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
