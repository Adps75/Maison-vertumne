"use client";

import { useState, useRef } from "react";
import type { PointDeVue, ExifData, CameraParams } from "../camera/types";
import { vfovFromFocal35mm, FOCALE_35MM_DEFAUT } from "../camera/fov";

/** Objectifs courants de smartphone (focale 35 mm équivalente). */
const OBJECTIFS = [
  { label: "Principal (26 mm)", focale: 26 },
  { label: "Grand-angle (13 mm)", focale: 13 },
  { label: "Zoom ×2 (52 mm)", focale: 52 },
] as const;

interface Props {
  projetId: string;
  zoneActive: string | null;
  pointsDeVue: PointDeVue[];
  onSelect: (pdv: PointDeVue) => void;
  onPlacer: (pdv: PointDeVue) => void;
  onImported: () => void;
  onFocaleChange: (pdvId: string, focale35mm: number) => void;
  onRename: (pdvId: string, nom: string) => void;
}

export function PanneauPointsDeVue({ projetId, zoneActive, pointsDeVue, onSelect, onPlacer, onImported, onFocaleChange, onRename }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chargement, setChargement] = useState(false);
  const [focaleOuverte, setFocaleOuverte] = useState<string | null>(null);
  const [focaleSaisie, setFocaleSaisie] = useState("");
  const [renommeId, setRenommeId] = useState<string | null>(null);
  const [renommeTexte, setRenommeTexte] = useState("");

  const importer = async (files: FileList) => {
    setChargement(true);
    try {
      const filesArr = Array.from(files);
      for (let i = 0; i < filesArr.length; i++) {
        const nom = `Vue ${pointsDeVue.length + i + 1}`;
        await importerPhoto(filesArr[i], projetId, zoneActive, nom);
      }
      onImported();
    } catch (e) {
      console.error("[points-de-vue] erreur import:", e);
    } finally {
      setChargement(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const choisirFocale = (pdvId: string, focale: number) => {
    onFocaleChange(pdvId, focale);
    setFocaleOuverte(null);
  };

  const validerFocaleSaisie = (pdvId: string) => {
    const v = parseFloat(focaleSaisie.replace(",", "."));
    if (!isNaN(v) && v > 0) {
      choisirFocale(pdvId, v);
    }
    setFocaleSaisie("");
  };

  return (
    <div
      className="absolute top-12 right-3 z-10 bg-white/95 border border-hair-light rounded shadow-md w-60 max-h-[60vh] overflow-y-auto"
      data-testid="panneau-points-de-vue"
    >
      <div className="px-3 py-2 border-b border-hair-light">
        <h3 className="text-[0.78rem] font-medium text-ink">Points de vue</h3>
      </div>

      {/* Liste */}
      <div className="px-2 py-1">
        {pointsDeVue.length === 0 && (
          <p className="text-[0.72rem] text-stone py-2 text-center">
            Importez une photo pour commencer.
          </p>
        )}
        {pointsDeVue.map((pdv, idx) => (
          <div key={pdv.id} className="mb-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSelect(pdv)}
                className="flex-1 text-left px-2 py-1.5 hover:bg-paper-2 rounded text-[0.75rem] flex items-center gap-2 min-w-0"
                data-testid={`pdv-${pdv.id}`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    pdv.statut === "cale" ? "bg-green-500" : "bg-amber-400"
                  }`}
                  title={pdv.statut === "cale" ? "Calée" : "À caler"}
                />
                <span className="flex-1 min-w-0">
                  {renommeId === pdv.id ? (
                    <input
                      type="text"
                      value={renommeTexte}
                      onChange={(e) => setRenommeTexte(e.target.value)}
                      onBlur={() => { onRename(pdv.id, renommeTexte); setRenommeId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onRename(pdv.id, renommeTexte); setRenommeId(null); }
                        if (e.key === "Escape") setRenommeId(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white border border-hair-light rounded px-1 py-0 text-[0.75rem]"
                      autoFocus
                      data-testid={`pdv-rename-input-${pdv.id}`}
                    />
                  ) : (
                    <span className="truncate block" data-testid={`pdv-nom-${pdv.id}`}>
                      {pdv.nom || `Vue ${idx + 1}`}
                    </span>
                  )}
                </span>
                <span className="text-[0.6rem] text-stone shrink-0">
                  {pdv.statut === "cale" ? "Calée" : "À caler"}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenommeId(pdv.id);
                  setRenommeTexte(pdv.nom || `Vue ${idx + 1}`);
                }}
                className="text-[0.65rem] text-stone hover:text-brass px-0.5 shrink-0"
                title="Renommer"
                data-testid={`pdv-rename-${pdv.id}`}
              >
                ✎
              </button>
            </div>
            {/* Indicateur focale estimée + sélecteur d'objectif */}
            {!pdv.exif.focale_35mm && (
              <div className="pl-6 text-[0.6rem]">
                <button
                  onClick={() => setFocaleOuverte(focaleOuverte === pdv.id ? null : pdv.id)}
                  className="text-amber-600 hover:text-amber-700"
                  data-testid={`pdv-focale-${pdv.id}`}
                >
                  Focale estimée ▾
                </button>
                {focaleOuverte === pdv.id && (
                  <div className="mt-1 bg-white border border-hair-light rounded shadow-sm p-1">
                    {OBJECTIFS.map((obj) => (
                      <button
                        key={obj.focale}
                        onClick={() => choisirFocale(pdv.id, obj.focale)}
                        className="block w-full text-left px-2 py-1 hover:bg-paper-2 rounded text-[0.65rem]"
                        data-testid={`pdv-obj-${obj.focale}`}
                      >
                        {obj.label}
                      </button>
                    ))}
                    <div className="flex gap-1 mt-1 px-1">
                      <input
                        type="text"
                        placeholder="Focale mm"
                        value={focaleSaisie}
                        onChange={(e) => setFocaleSaisie(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") validerFocaleSaisie(pdv.id); }}
                        className="flex-1 border border-hair-light rounded px-1 py-0.5 text-[0.65rem] w-16"
                        data-testid="input-focale-custom"
                      />
                      <button
                        onClick={() => validerFocaleSaisie(pdv.id)}
                        className="text-[0.65rem] text-brass hover:text-brass-soft px-1"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Import */}
      <div className="px-3 py-2 border-t border-hair-light">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="input-photo"
          onChange={(e) => e.target.files && importer(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={chargement}
          className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 rounded px-3 py-1.5 text-[0.75rem] disabled:opacity-50"
          data-testid="btn-importer-photo"
        >
          {chargement ? "Import en cours…" : "Importer des photos"}
        </button>
      </div>
    </div>
  );
}

// ─── Import photo ───────────────────────────────────────────────────────────

async function importerPhoto(file: File, projetId: string, zoneId: string | null, nom: string) {
  // 1. Lire l'EXIF AVANT tout réencodage
  const exifr = await import("exifr");
  let exifData: ExifData = {
    marque: null,
    modele: null,
    focale: null,
    focale_35mm: null,
    date: null,
  };
  let orientation = 1;

  try {
    const raw = await exifr.default.parse(file, [
      "FocalLength",
      "FocalLengthIn35mmFormat",
      "Make",
      "Model",
      "Orientation",
      "DateTimeOriginal",
    ]);

    if (raw) {
      exifData = {
        marque: raw.Make ?? null,
        modele: raw.Model ?? null,
        focale: raw.FocalLength ?? null,
        focale_35mm: raw.FocalLengthIn35mmFormat ?? null,
        date: raw.DateTimeOriginal
          ? (raw.DateTimeOriginal instanceof Date
            ? raw.DateTimeOriginal.toISOString()
            : String(raw.DateTimeOriginal))
          : null,
      };
      orientation = raw.Orientation ?? 1;
    }
  } catch {
    // EXIF illisible — on continue avec les valeurs par défaut
  }

  // 2. Réencoder : orientation appliquée, 3000 px max, JPEG 0.9
  const { blob, width, height } = await reencoder(file, orientation, 3000, 0.9);

  // 3. Calculer le FOV initial
  const aspect = width / height;
  const focale = exifData.focale_35mm ?? FOCALE_35MM_DEFAUT;
  const fov_v = vfovFromFocal35mm(focale, aspect);

  // 4. Envoyer au serveur
  const formData = new FormData();
  formData.append("photo", blob, "photo.jpg");
  formData.append("nom", nom);
  if (zoneId) formData.append("zone_id", zoneId);
  formData.append("largeur_px", String(width));
  formData.append("hauteur_px", String(height));
  formData.append("exif", JSON.stringify(exifData));
  formData.append("camera", JSON.stringify({
    x: 0, y: 0, hauteur: 1.6,
    cap: 0, inclinaison: 0, roulis: 0,
    fov_v,
  } satisfies CameraParams));

  const res = await fetch(`/api/conception/projets/${projetId}/points-de-vue`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Erreur import: ${res.status}`);
}

async function reencoder(
  file: File,
  orientation: number,
  maxPx: number,
  qualite: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;

      const flip = orientation >= 5 && orientation <= 8;
      if (flip) [sw, sh] = [sh, sw];

      const scale = Math.min(1, maxPx / Math.max(sw, sh));
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d")!;

      appliquerOrientation(ctx, orientation, dw, dh);
      ctx.drawImage(img, 0, 0, flip ? dh : dw, flip ? dw : dh);

      canvas.toBlob(
        (b) => (b ? resolve({ blob: b, width: dw, height: dh }) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        qualite,
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function appliquerOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  w: number,
  h: number,
) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
}
