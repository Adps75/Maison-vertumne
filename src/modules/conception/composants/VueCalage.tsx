"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { PointDeVue, CameraParams } from "../camera/types";
import type { DonneesScene3D } from "../scene3d/types";

const SceneCalageDynamic = dynamic(
  () => import("../scene3d/composants/SceneCalage").then((m) => m.SceneCalage),
  { ssr: false },
);

interface Props {
  pdv: PointDeVue;
  donnees: DonneesScene3D;
  altitudeEn: (x: number, y: number) => number;
  onSave: (camera: CameraParams) => void;
  onClose: () => void;
  onVisuel: () => void;
}

const PAS = 1;
const PAS_FIN = 0.1;

export function VueCalage({ pdv, donnees, altitudeEn, onSave, onClose, onVisuel }: Props) {
  const [cam, setCam] = useState<CameraParams>({ ...pdv.camera });
  const [opacite, setOpacite] = useState(60);

  const modifier = useCallback((champ: keyof CameraParams, delta: number) => {
    setCam((c) => ({ ...c, [champ]: c[champ] + delta }));
  }, []);

  // Clavier : flèches pour cap/inclinaison, avec Shift pour pas fin
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const pas = e.shiftKey ? PAS_FIN : PAS;
      switch (e.key) {
        case "ArrowLeft":  e.preventDefault(); modifier("cap", -pas); break;
        case "ArrowRight": e.preventDefault(); modifier("cap", pas); break;
        case "ArrowUp":    e.preventDefault(); modifier("inclinaison", pas); break;
        case "ArrowDown":  e.preventDefault(); modifier("inclinaison", -pas); break;
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modifier]);

  const reinitialiser = () => setCam({ ...pdv.camera });

  const enregistrer = () => onSave(cam);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col" data-testid="vue-calage">
      {/* Barre supérieure */}
      <div className="flex items-center gap-4 px-4 py-2 bg-stone-800 text-stone-200 text-sm shrink-0">
        <button onClick={onClose} className="hover:text-white" data-testid="btn-retour-calage">
          ← Retour
        </button>
        <span className="font-medium">{pdv.nom}</span>
        <div className="flex-1" />
        <button
          className="bg-stone-700 px-3 py-1 rounded text-[0.75rem] border border-stone-500"
          data-testid="btn-mode-calage"
        >
          Calage
        </button>
        <button
          onClick={onVisuel}
          className="bg-stone-700 hover:bg-stone-600 px-3 py-1 rounded text-[0.75rem]"
          data-testid="btn-mode-visuel"
        >
          Visuel
        </button>
      </div>

      {/* Zone principale */}
      <div className="flex-1 flex min-h-0">
        {/* Photo + scène superposée */}
        <div className="flex-1 relative flex items-center justify-center bg-black">
          {/* Photo */}
          <img
            src={`/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/image`}
            alt={pdv.nom}
            className="absolute max-w-full max-h-full object-contain"
            style={{ opacity: opacite / 100 }}
            data-testid="photo-calage"
          />
          {/* Canvas 3D superposé, exactement sur la photo */}
          <div
            className="absolute"
            style={{
              width: "100%",
              height: "100%",
              maxWidth: `min(100%, ${pdv.largeur_px}px)`,
              maxHeight: `min(100%, ${pdv.hauteur_px}px)`,
              aspectRatio: `${pdv.largeur_px} / ${pdv.hauteur_px}`,
            }}
            data-testid="canvas-calage"
          >
            <SceneCalageDynamic
              donnees={donnees}
              camera={cam}
              altitudeEn={altitudeEn}
            />
          </div>
        </div>

        {/* Panneau de réglages */}
        <div className="w-56 bg-stone-800 text-stone-200 p-3 overflow-y-auto shrink-0 text-[0.75rem]">
          <h4 className="font-medium mb-3 text-stone-300">Réglages caméra</h4>

          <Curseur label="Cap" value={cam.cap} unite="°" onChange={(v) => setCam((c) => ({ ...c, cap: v }))} min={-180} max={360} step={0.1} testid="slider-cap" />
          <Curseur label="Inclinaison" value={cam.inclinaison} unite="°" onChange={(v) => setCam((c) => ({ ...c, inclinaison: v }))} min={-90} max={90} step={0.1} testid="slider-inclinaison" />
          <Curseur label="Roulis" value={cam.roulis} unite="°" onChange={(v) => setCam((c) => ({ ...c, roulis: v }))} min={-45} max={45} step={0.1} testid="slider-roulis" />
          <Curseur label="Hauteur" value={cam.hauteur} unite="m" onChange={(v) => setCam((c) => ({ ...c, hauteur: v }))} min={0.5} max={10} step={0.05} testid="slider-hauteur" />
          <Curseur label="Avant/Arrière" value={0} unite="m" onChange={(v) => {
            const rad = -cam.cap * Math.PI / 180;
            setCam((c) => ({ ...c, x: c.x + Math.sin(rad) * v, y: c.y - Math.cos(rad) * v }));
          }} min={-5} max={5} step={0.1} />
          <Curseur label="Gauche/Droite" value={0} unite="m" onChange={(v) => {
            const rad = -cam.cap * Math.PI / 180 + Math.PI / 2;
            setCam((c) => ({ ...c, x: c.x + Math.sin(rad) * v, y: c.y - Math.cos(rad) * v }));
          }} min={-5} max={5} step={0.1} />
          <Curseur label="Champ de vision" value={cam.fov_v} unite="°" onChange={(v) => setCam((c) => ({ ...c, fov_v: v }))} min={10} max={120} step={0.5} testid="slider-fov" />

          <div className="mt-4 pt-3 border-t border-stone-700">
            <Curseur label="Opacité photo" value={opacite} unite="%" onChange={setOpacite} min={0} max={100} step={5} />
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={reinitialiser} className="flex-1 bg-stone-700 hover:bg-stone-600 rounded px-2 py-1.5">
              Réinitialiser
            </button>
            <button
              onClick={enregistrer}
              className="flex-1 bg-brass hover:bg-brass-soft text-paper rounded px-2 py-1.5"
              data-testid="btn-enregistrer-calage"
            >
              Enregistrer
            </button>
          </div>
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
          {value.toFixed(step < 1 ? 1 : 0)}{unite}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-brass"
        data-testid={testid}
      />
    </div>
  );
}
