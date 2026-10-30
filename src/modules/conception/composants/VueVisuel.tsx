"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { PointDeVue, SoleilParams } from "../camera/types";
import type { DonneesScene3D } from "../scene3d/types";

const SceneVisuelDynamic = dynamic(
  () => import("../scene3d/composants/SceneVisuel").then((m) => m.SceneVisuel),
  { ssr: false },
);

interface Props {
  pdv: PointDeVue;
  donnees: DonneesScene3D;
  altitudeEn: (x: number, y: number) => number;
  onSaveSoleil: (soleil: SoleilParams) => void | Promise<void>;
  onClose: () => void;
  onCalage: () => void;
}

export function VueVisuel({ pdv, donnees, altitudeEn, onSaveSoleil, onClose, onCalage }: Props) {
  const [soleil, setSoleil] = useState<SoleilParams>({ ...pdv.soleil });
  const [statutSoleil, setStatutSoleil] = useState<"idle" | "saving" | "saved">("idle");
  const canvasContainerRef = useRef<HTMLDivElement>(null);
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

    const canvas3d = container.querySelector("canvas");
    if (!canvas3d) return;

    const out = document.createElement("canvas");
    out.width = pdv.largeur_px;
    out.height = pdv.hauteur_px;
    const ctx = out.getContext("2d")!;

    ctx.drawImage(photoImg, 0, 0, pdv.largeur_px, pdv.hauteur_px);
    ctx.drawImage(canvas3d, 0, 0, pdv.largeur_px, pdv.hauteur_px);

    const mention = "Visuel d'ambiance non contractuel, végétaux à 2-3 ans";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    const fontSize = Math.max(12, pdv.largeur_px * 0.012);
    ctx.font = `${fontSize}px sans-serif`;
    const textW = ctx.measureText(mention).width;
    ctx.fillRect(
      (pdv.largeur_px - textW) / 2 - 8,
      pdv.hauteur_px - fontSize - 16,
      textW + 16,
      fontSize + 12,
    );
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(mention, (pdv.largeur_px - textW) / 2, pdv.hauteur_px - 12);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdv.nom || "visuel"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
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
        <button
          onClick={onCalage}
          className="bg-stone-700 hover:bg-stone-600 px-3 py-1 rounded text-[0.75rem]"
          data-testid="btn-mode-calage-from-visuel"
        >
          Calage
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
      <div className="flex-1 flex min-h-0">
        {/* Photo + scène superposée */}
        <div ref={parentRef} className="flex-1 relative bg-black overflow-hidden">
          {/* Photo pleine opacité */}
          <img
            ref={photoRef}
            src={`/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/image`}
            alt={pdv.nom}
            className="absolute max-w-full max-h-full object-contain"
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
              <SceneVisuelDynamic
                donnees={donnees}
                camera={pdv.camera}
                soleil={soleil}
                altitudeEn={altitudeEn}
                photoAspect={pdv.largeur_px / pdv.hauteur_px}
              />
            </div>
          )}
        </div>

        {/* Panneau soleil */}
        <div className="w-48 bg-stone-800 text-stone-200 p-3 overflow-y-auto shrink-0 text-[0.75rem]">
          <h4 className="font-medium mb-3 text-stone-300">Soleil</h4>
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
