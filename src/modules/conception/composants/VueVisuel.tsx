"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { PointDeVue, SoleilParams } from "../camera/types";
import type { Element } from "../types";
import type { DonneesScene3D } from "../scene3d/types";
import type { Action } from "../editeur/reducer";
import { useInteractionVegetaux3D } from "../scene3d/interaction-vegetaux";
import { PanneauVegetaux3D } from "./PanneauVegetaux3D";
import { PanneauProprietes3D } from "./PanneauProprietes3D";
import { BoutonTraits, type ReglagesTraits } from "./TraitsConstructionControle";
import { PanneauRenduIA } from "./PanneauRenduIA";
import { dessinerMention, telechargerCanvas } from "../rendu/mention";
import type { CaptureurRendu } from "../scene3d/capture-rendu";

const SceneVisuelDynamic = dynamic(
  () => import("../scene3d/composants/SceneVisuel").then((m) => m.SceneVisuel),
  { ssr: false },
);

const SceneTraitsDynamic = dynamic(
  () => import("../scene3d/composants/SceneTraits").then((m) => m.SceneTraits),
  { ssr: false },
);

interface Props {
  pdv: PointDeVue;
  donnees: DonneesScene3D;
  altitudeEn: (x: number, y: number) => number;
  onSaveSoleil: (soleil: SoleilParams) => void | Promise<void>;
  onClose: () => void;
  onCalage: () => void;
  dispatch: React.Dispatch<Action>;
  elements: Map<string, Element>;
  selection: Set<string>;
  tolerance: number;
  zoneContour?: [number, number][] | null;
  reglagesTraits: ReglagesTraits;
  /** Ouvre l'assistant de composition IA. */
  onComposerIA?: () => void;
}

export function VueVisuel({ pdv, donnees, altitudeEn, onSaveSoleil, onClose, onCalage, dispatch, elements, selection, tolerance, zoneContour, reglagesTraits, onComposerIA }: Props) {
  const [soleil, setSoleil] = useState<SoleilParams>({ ...pdv.soleil });
  const [statutSoleil, setStatutSoleil] = useState<"idle" | "saving" | "saved">("idle");
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<CaptureurRendu | null>(null);
  const [renduOuvert, setRenduOuvert] = useState(false);

  // Interaction végétaux 3D
  const {
    mode: modeVeg, planteAPoser, messageErreur,
    previewPositionRef, dragPositionRef, isDraggingRef, dragElementIdRef,
    downScreenRef, raycastCallbacks, onDragMove, activerPlacement, annulerPlacement,
  } = useInteractionVegetaux3D({ dispatch, elements, selection, altitudeEn, tolerance, zoneContour });

  // Élément sélectionné (pour panneau propriétés)
  const selectedElement = selection.size === 1
    ? elements.get(Array.from(selection)[0])
    : undefined;
  const selectedVegetal = selectedElement?.type === "vegetal" ? selectedElement : undefined;

  // Clavier : Échap, Suppr, Cmd+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modeVeg === "placement") { annulerPlacement(); return; }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.size > 0) {
          e.preventDefault();
          dispatch({ type: "SUPPRIMER_SELECTION" });
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "ANNULER" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "RETABLIR" });
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modeVeg, selection, dispatch, annulerPlacement]);
  const photoRef = useRef<HTMLImageElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [photoRect, setPhotoRect] = useState<{ w: number; h: number; x: number; y: number } | null>(null);

  // Mesurer la taille réelle affichée de la photo (à partir du DOM)
  const mesurerPhoto = useCallback(() => {
    const img = photoRef.current;
    const parent = parentRef.current;
    if (!img || !parent || !img.complete || img.naturalWidth === 0) return;

    const pr = parent.getBoundingClientRect();
    const ir = img.getBoundingClientRect();

    setPhotoRect({
      w: ir.width,
      h: ir.height,
      x: ir.left - pr.left,
      y: ir.top - pr.top,
    });
  }, []);

  useEffect(() => {
    mesurerPhoto();
    const parent = parentRef.current;
    if (!parent) return;
    const observer = new ResizeObserver(mesurerPhoto);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [mesurerPhoto]);

  const onPhotoLoad = useCallback(() => mesurerPhoto(), [mesurerPhoto]);

  const exporterPNG = useCallback(async () => {
    const container = canvasContainerRef.current;
    const photoImg = photoRef.current;
    if (!container || !photoImg) return;

    // Scène principale uniquement : les traits de construction (scène superposée)
    // ne figurent jamais dans l'export.
    const canvas3d = container.querySelector<HTMLCanvasElement>("[data-scene='principale'] canvas");
    if (!canvas3d) return;

    const out = document.createElement("canvas");
    out.width = pdv.largeur_px;
    out.height = pdv.hauteur_px;
    const ctx = out.getContext("2d")!;

    ctx.drawImage(photoImg, 0, 0, pdv.largeur_px, pdv.hauteur_px);
    ctx.drawImage(canvas3d, 0, 0, pdv.largeur_px, pdv.hauteur_px);

    dessinerMention(ctx, pdv.largeur_px, pdv.hauteur_px);
    await telechargerCanvas(out, `${pdv.nom || "visuel"}.png`);
  }, [pdv]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col" data-testid="vue-visuel">
      {/* Barre supérieure */}
      <div className="flex items-center gap-4 px-4 py-2 bg-stone-800 text-stone-200 text-sm shrink-0">
        <button onClick={onClose} className="hover:text-white" data-testid="btn-retour-visuel">
          ← Retour
        </button>
        <span className="font-medium">{pdv.nom}</span>
        <div className="flex-1" />
        <BoutonTraits reglages={reglagesTraits} />
        {onComposerIA && (
          <button
            onClick={onComposerIA}
            className="px-3 py-1 rounded text-[0.75rem] bg-paper text-ink border border-hair-light hover:bg-paper-2"
            data-testid="btn-composer-ia-visuel"
          >
            Composer avec l&apos;IA
          </button>
        )}
        <button
          onClick={() => setRenduOuvert((v) => !v)}
          aria-pressed={renduOuvert}
          className={`px-3 py-1 rounded text-[0.75rem] ${renduOuvert ? "bg-ink text-paper" : "bg-paper text-ink border border-hair-light hover:bg-paper-2"}`}
          data-testid="btn-rendu-ia"
        >
          Rendu IA
        </button>
        <button
          onClick={onCalage}
          className="bg-stone-700 hover:bg-stone-600 px-3 py-1 rounded text-[0.75rem]"
          data-testid="btn-mode-calage-from-visuel"
        >
          Recaler
        </button>
        <button
          className="bg-stone-700 px-3 py-1 rounded text-[0.75rem] border border-stone-500"
          data-testid="btn-mode-visuel-active"
        >
          Visuel
        </button>
        <button
          onClick={exporterPNG}
          className="bg-brass hover:bg-brass-soft text-paper px-3 py-1 rounded text-[0.75rem]"
          data-testid="btn-export-png"
        >
          Exporter PNG
        </button>
      </div>

      {/* Zone principale */}
      <div className="flex-1 flex min-h-0 relative">
        {renduOuvert && (
          <PanneauRenduIA pdv={pdv} captureRef={captureRef} onFermer={() => setRenduOuvert(false)} />
        )}
        {/* Photo + scène superposée */}
        <div ref={parentRef} className="flex-1 relative bg-black overflow-hidden">
          {/* Photo pleine opacité — pointer-events: none pour laisser passer les clics au Canvas 3D */}
          <img
            ref={photoRef}
            src={`/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/image`}
            alt={pdv.nom}
            className="absolute max-w-full max-h-full object-contain pointer-events-none"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
            crossOrigin="anonymous"
            onLoad={onPhotoLoad}
            draggable={false}
            data-testid="photo-visuel"
          />
          {/* Canvas 3D superposé, exactement sur le rectangle affiché de la photo */}
          {photoRect && (
            <div
              ref={canvasContainerRef}
              className="absolute"
              style={{
                left: photoRect.x,
                top: photoRect.y,
                width: photoRect.w,
                height: photoRect.h,
              }}
              data-testid="canvas-visuel"
            >
              <div className="absolute inset-0" data-scene="principale">
              <SceneVisuelDynamic
                donnees={donnees}
                camera={pdv.camera}
                soleil={soleil}
                altitudeEn={altitudeEn}
                photoAspect={pdv.largeur_px / pdv.hauteur_px}
                raycastCallbacks={raycastCallbacks}
                onDragMove={onDragMove}
                downScreenRef={downScreenRef}
                selection={selection}
                planteAPoser={planteAPoser}
                previewPositionRef={previewPositionRef}
                dragPositionRef={dragPositionRef}
                dragElementIdRef={dragElementIdRef}
                captureRef={captureRef}
              />
              </div>
              {/* Traits de construction : scène superposée, transparente aux clics, hors export */}
              <div className="absolute inset-0 pointer-events-none" data-testid="traits-visuel">
                <SceneTraitsDynamic
                  donnees={donnees}
                  camera={pdv.camera}
                  altitudeEn={altitudeEn}
                  photoAspect={pdv.largeur_px / pdv.hauteur_px}
                  traits={reglagesTraits.traits}
                />
              </div>
            </div>
          )}
        </div>

        {/* Panneau végétaux 3D */}
        <PanneauVegetaux3D
          onSelectPlante={activerPlacement}
          planteActive={planteAPoser}
        />

        {/* Panneau propriétés plante sélectionnée */}
        {selectedVegetal && (
          <PanneauProprietes3D
            element={selectedVegetal}
            onModifier={(el) => dispatch({ type: "MODIFIER_ELEMENTS", elements: [el] })}
            onRemplacer={() => {
              // Ouvre le panneau végétaux (il est déjà visible)
            }}
          />
        )}

        {/* Message d'erreur */}
        {messageErreur && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-paper text-red-700 border border-red-300 px-4 py-2 rounded shadow-sm text-sm">
            {messageErreur}
          </div>
        )}

        {/* Indicateur mode placement */}
        {modeVeg === "placement" && planteAPoser && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-paper text-ink border border-hair-light px-4 py-2 rounded shadow-sm text-[0.75rem]">
            Cliquez sur le sol pour poser {planteAPoser.nom_commun} — Échap pour annuler
          </div>
        )}

        {/* Panneau soleil */}
        <div className="w-48 bg-paper border-l border-hair-light text-ink p-3 overflow-y-auto shrink-0 text-[0.75rem] shadow-md">
          <h4 className="font-medium mb-3 text-stone">Soleil</h4>
          <Curseur
            label="Azimut" value={soleil.azimut} unite="°"
            onChange={(v) => setSoleil((s) => ({ ...s, azimut: v }))}
            min={0} max={360} step={1}
            testid="slider-azimut"
          />
          <Curseur
            label="Élévation" value={soleil.elevation} unite="°"
            onChange={(v) => setSoleil((s) => ({ ...s, elevation: v }))}
            min={5} max={85} step={1}
            testid="slider-elevation"
          />
          <button
            onClick={async () => {
              setStatutSoleil("saving");
              try {
                await onSaveSoleil(soleil);
                setStatutSoleil("saved");
                setTimeout(() => setStatutSoleil("idle"), 1500);
              } catch {
                setStatutSoleil("idle");
              }
            }}
            disabled={statutSoleil === "saving"}
            className="mt-3 w-full bg-brass hover:bg-brass-soft text-paper rounded px-2 py-1.5 disabled:opacity-70"
          >
            {statutSoleil === "saving" ? "Enregistrement…" : statutSoleil === "saved" ? "Enregistré ✓" : "Enregistrer soleil"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Curseur({
  label, value, unite, onChange, min, max, step, testid,
}: {
  label: string; value: number; unite: string;
  onChange: (v: number) => void;
  min: number; max: number; step: number;
  testid?: string;
}) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[0.7rem] text-stone-400 mb-0.5">
        <span>{label}</span>
        <span data-testid={testid ? `${testid}-value` : undefined}>
          {value.toFixed(0)}{unite}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-brass"
        data-testid={testid}
      />
    </div>
  );
}
