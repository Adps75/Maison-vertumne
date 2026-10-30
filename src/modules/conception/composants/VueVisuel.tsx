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
  onSaveSoleil: (soleil: SoleilParams) => void;
  onClose: () => void;
  onCalage: () => void;
}

export function VueVisuel({ pdv, donnees, altitudeEn, onSaveSoleil, onClose, onCalage }: Props) {
  const [soleil, setSoleil] = useState<SoleilParams>({ ...pdv.soleil });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);

  const exporterPNG = useCallback(async () => {
    const container = canvasContainerRef.current;
    const photoImg = photoRef.current;
    if (!container || !photoImg) return;

    const canvas3d = container.querySelector("canvas");
    if (!canvas3d) return;

    // Canvas 2D à la résolution de la photo
    const out = document.createElement("canvas");
    out.width = pdv.largeur_px;
    out.height = pdv.hauteur_px;
    const ctx = out.getContext("2d")!;

    // 1. Photo en arrière-plan
    ctx.drawImage(photoImg, 0, 0, pdv.largeur_px, pdv.hauteur_px);

    // 2. Rendu 3D par-dessus (végétaux + ombres, fond transparent)
    ctx.drawImage(canvas3d, 0, 0, pdv.largeur_px, pdv.hauteur_px);

    // 3. Mention en bas
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

    // Télécharger
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
        <div className="flex-1 relative flex items-center justify-center bg-black">
          {/* Photo pleine opacité */}
          <img
            ref={photoRef}
            src={`/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/image`}
            alt={pdv.nom}
            className="absolute max-w-full max-h-full object-contain"
            crossOrigin="anonymous"
            data-testid="photo-visuel"
          />
          {/* Canvas 3D superposé, exactement sur la photo */}
          <div
            ref={canvasContainerRef}
            className="absolute"
            style={{
              width: "100%",
              height: "100%",
              maxWidth: `min(100%, ${pdv.largeur_px}px)`,
              maxHeight: `min(100%, ${pdv.hauteur_px}px)`,
              aspectRatio: `${pdv.largeur_px} / ${pdv.hauteur_px}`,
            }}
            data-testid="canvas-visuel"
          >
            <SceneVisuelDynamic
              donnees={donnees}
              camera={pdv.camera}
              soleil={soleil}
              altitudeEn={altitudeEn}
            />
          </div>
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
            onClick={() => onSaveSoleil(soleil)}
            className="mt-3 w-full bg-brass hover:bg-brass-soft text-paper rounded px-2 py-1.5"
          >
            Enregistrer soleil
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
