"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import type { PointDeVue, CameraParams } from "../camera/types";
import type { DonneesScene3D } from "../scene3d/types";
import { normaliserCap, vfovFromFocal35mm } from "../camera/fov";

const SceneCalageDynamic = dynamic(
  () => import("../scene3d/composants/SceneCalage").then((m) => m.SceneCalage),
  { ssr: false },
);

/** Objectifs courants. */
const OBJECTIFS = [
  { label: "Principal (×1, 26 mm)", focale: 26, description: "Objectif standard des smartphones" },
  { label: "Grand-angle (×0,5, 13 mm)", focale: 13, description: "Vue large, idéal pour les petits jardins" },
  { label: "Zoom (×2, 52 mm)", focale: 52, description: "Vue rapprochée, comme un portrait" },
] as const;

type EtapeCalage = 1 | 2 | 3 | 4;

const TITRES_ETAPES: Record<EtapeCalage, string> = {
  1: "Où étiez-vous ?",
  2: "Quel objectif ?",
  3: "Alignez la maison",
  4: "C'est calé",
};

interface Props {
  pdv: PointDeVue;
  donnees: DonneesScene3D;
  altitudeEn: (x: number, y: number) => number;
  orthoUrl: string | null;
  orthoEmprise: [number, number, number, number] | null;
  batiments: { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; hauteur: number | null; cleabs: string }[];
  parcelles: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onSave: (camera: CameraParams, statut: "a_caler" | "cale") => void;
  onFocaleChange: (focale35mm: number) => void;
  onClose: () => void;
  onVisuel: () => void;
}

export function VueCalage({
  pdv, donnees, altitudeEn,
  orthoUrl, orthoEmprise, batiments, parcelles,
  onSave, onFocaleChange, onClose, onVisuel,
}: Props) {
  // Determine initial step
  const nonPlace = pdv.camera.x === 0 && pdv.camera.y === 0;
  const focaleManquante = !pdv.exif.focale_35mm;
  const etapeInitiale: EtapeCalage = nonPlace ? 1 : (focaleManquante ? 2 : 3);

  const [etape, setEtape] = useState<EtapeCalage>(etapeInitiale);
  const [cam, setCam] = useState<CameraParams>({ ...pdv.camera });
  const [grilleVisible, setGrilleVisible] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  // Step 1 state
  const [positionClic, setPositionClic] = useState<[number, number] | null>(
    nonPlace ? null : [pdv.camera.x, pdv.camera.y]
  );
  const [directionClic, setDirectionClic] = useState<[number, number] | null>(null);

  // Photo measurement for step 3
  const photoRef = useRef<HTMLImageElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [photoRect, setPhotoRect] = useState<{ w: number; h: number; x: number; y: number } | null>(null);

  const mesurerPhoto = useCallback(() => {
    const img = photoRef.current;
    const parent = parentRef.current;
    if (!img || !parent || !img.complete || img.naturalWidth === 0) return;
    const pr = parent.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setPhotoRect({ w: ir.width, h: ir.height, x: ir.left - pr.left, y: ir.top - pr.top });
  }, []);

  useEffect(() => {
    if (etape !== 3) return;
    mesurerPhoto();
    const parent = parentRef.current;
    if (!parent) return;
    const observer = new ResizeObserver(mesurerPhoto);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [mesurerPhoto, etape]);

  // Drag on photo (step 3)
  const dragRef = useRef<{ startX: number; startY: number; shift: boolean; pointerId: number } | null>(null);
  const camRef = useRef(cam);
  camRef.current = cam;

  const onPointerDownPhoto = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, shift: e.shiftKey, pointerId: e.pointerId };
  }, []);

  const onPointerMovePhoto = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    d.startX = e.clientX;
    d.startY = e.clientY;
    const hauteurAffichee = photoRect?.h ?? 400;
    const sensibilite = camRef.current.fov_v / hauteurAffichee;
    if (d.shift || e.shiftKey) {
      const rad = -camRef.current.cap * Math.PI / 180;
      const avance = dy * sensibilite * 0.05;
      const lateral = dx * sensibilite * 0.05;
      setCam((c) => ({
        ...c,
        x: c.x + Math.sin(rad) * avance + Math.cos(rad) * lateral,
        y: c.y - Math.cos(rad) * avance + Math.sin(rad) * lateral,
      }));
    } else {
      setCam((c) => ({
        ...c,
        cap: normaliserCap(c.cap - dx * sensibilite),
        inclinaison: Math.max(-90, Math.min(90, c.inclinaison + dy * sensibilite)),
      }));
    }
  }, [photoRect]);

  const onPointerUpPhoto = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }, []);

  const onWheelPhoto = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.5 : -0.5;
    setCam((c) => ({ ...c, fov_v: Math.max(10, Math.min(120, c.fov_v + delta)) }));
  }, []);

  // Keyboard
  useEffect(() => {
    if (etape !== 3) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const pas = e.shiftKey ? 0.1 : 0.5;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); setCam((c) => ({ ...c, cap: normaliserCap(c.cap - pas) })); break;
        case "ArrowRight": e.preventDefault(); setCam((c) => ({ ...c, cap: normaliserCap(c.cap + pas) })); break;
        case "ArrowUp": e.preventDefault(); setCam((c) => ({ ...c, inclinaison: Math.min(90, c.inclinaison + pas) })); break;
        case "ArrowDown": e.preventDefault(); setCam((c) => ({ ...c, inclinaison: Math.max(-90, c.inclinaison - pas) })); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [etape]);

  // Step navigation
  const suivant = () => {
    if (etape === 1 && positionClic && directionClic) {
      const [x1, y1] = positionClic;
      const [x2, y2] = directionClic;
      const cap = normaliserCap(Math.atan2(x2 - x1, y2 - y1) * 180 / Math.PI);
      const newCam = { ...cam, x: x1, y: y1, cap, hauteur: 1.6 };
      setCam(newCam);
      onSave(newCam, "a_caler");
      setEtape(focaleManquante ? 2 : 3);
    } else if (etape === 2) {
      setEtape(3);
    } else if (etape === 3) {
      onSave({ ...cam, cap: normaliserCap(cam.cap) }, "a_caler");
      setEtape(4);
    }
  };

  const validerCalage = () => {
    onSave({ ...cam, cap: normaliserCap(cam.cap) }, "cale");
    onVisuel();
  };

  const choisirFocale = (focale: number) => {
    const aspect = pdv.largeur_px / pdv.hauteur_px;
    const fov_v = vfovFromFocal35mm(focale, aspect);
    setCam((c) => ({ ...c, fov_v }));
    onFocaleChange(focale);
    setEtape(3);
  };

  const replacerCamera = () => {
    setPositionClic(null);
    setDirectionClic(null);
    setEtape(1);
  };

  // Movement helpers for CurseurPrecis
  const deplacerAvant = useCallback((delta: number) => {
    const rad = -cam.cap * Math.PI / 180;
    setCam((c) => ({ ...c, x: c.x + Math.sin(rad) * delta, y: c.y - Math.cos(rad) * delta }));
  }, [cam.cap]);

  const deplacerLateral = useCallback((delta: number) => {
    const rad = -cam.cap * Math.PI / 180 + Math.PI / 2;
    setCam((c) => ({ ...c, x: c.x + Math.sin(rad) * delta, y: c.y - Math.cos(rad) * delta }));
  }, [cam.cap]);

  // Readable name
  const nomAffiche = pdv.nom.length > 30 ? pdv.nom.slice(0, 30) + "…" : pdv.nom;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col" data-testid="vue-calage">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 bg-stone-800 text-stone-200 text-sm shrink-0">
        <button onClick={onClose} className="hover:text-white" data-testid="btn-retour-calage">
          ← Retour au projet
        </button>
        <span className="font-medium truncate max-w-[200px]">{nomAffiche}</span>
        <div className="flex-1" />
        <span className="text-stone-400 text-[0.75rem]" data-testid="calage-etape">
          Étape {etape} sur 4 : {TITRES_ETAPES[etape]}
        </span>
        {etape >= 3 && (
          <button
            onClick={replacerCamera}
            className="text-[0.72rem] text-stone-400 hover:text-white"
            data-testid="btn-replacer-camera"
          >
            Replacer la caméra
          </button>
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 min-h-0 relative">
        {etape === 1 && (
          <Etape1Plan
            orthoUrl={orthoUrl}
            orthoEmprise={orthoEmprise}
            batiments={batiments}
            parcelles={parcelles}
            zoneContour={donnees.zoneContour}
            positionClic={positionClic}
            directionClic={directionClic}
            fov_v={cam.fov_v}
            onPositionClic={setPositionClic}
            onDirectionClic={setDirectionClic}
          />
        )}

        {etape === 2 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-8" data-testid="calage-etape-2">
            <h2 className="text-xl font-medium text-stone-200">Quel objectif avez-vous utilisé ?</h2>
            <p className="text-stone-400 text-sm text-center max-w-md">
              La focale n'a pas été trouvée dans les données de la photo.
              Choisissez l'objectif utilisé pour un calage précis.
            </p>
            <div className="flex flex-col gap-3 w-full max-w-sm">
              {OBJECTIFS.map((obj) => (
                <button
                  key={obj.focale}
                  onClick={() => choisirFocale(obj.focale)}
                  className="bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-lg px-6 py-4 text-left"
                  data-testid={`btn-objectif-${obj.focale}`}
                >
                  <span className="font-medium">{obj.label}</span>
                  <span className="block text-[0.75rem] text-stone-400 mt-1">{obj.description}</span>
                </button>
              ))}
              <FocaleSaisie onChoix={choisirFocale} />
            </div>
          </div>
        )}

        {etape === 3 && (
          <div className="flex h-full" data-testid="calage-etape-3">
            {/* Photo + 3D overlay */}
            <div
              ref={parentRef}
              className="flex-1 relative bg-black overflow-hidden"
              style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
              onPointerDown={onPointerDownPhoto}
              onPointerMove={onPointerMovePhoto}
              onPointerUp={onPointerUpPhoto}
              onWheel={onWheelPhoto}
            >
              <img
                ref={photoRef}
                src={`/api/conception/projets/${pdv.projet_id}/points-de-vue/${pdv.id}/image`}
                alt={pdv.nom}
                className="absolute max-w-full max-h-full object-contain"
                style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                onLoad={mesurerPhoto}
                draggable={false}
                data-testid="photo-calage"
              />
              {photoRect && (
                <div
                  className="absolute pointer-events-none"
                  style={{ left: photoRect.x, top: photoRect.y, width: photoRect.w, height: photoRect.h }}
                  data-testid="canvas-calage"
                >
                  <SceneCalageDynamic
                    donnees={donnees}
                    camera={cam}
                    altitudeEn={altitudeEn}
                    photoAspect={pdv.largeur_px / pdv.hauteur_px}
                    afficherGrille={grilleVisible}
                    afficherSurfaces={false}
                  />
                </div>
              )}

              {/* Help text */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-stone-300 px-4 py-2 rounded text-[0.75rem] text-center max-w-lg pointer-events-none">
                Faites glisser la photo pour superposer les traits bleus aux murs de la maison.
                Molette : zoom de l'objectif. Maj + glisser : déplacer votre position.
              </div>

              {/* Grid toggle */}
              <button
                onClick={() => setGrilleVisible((v) => !v)}
                className={`absolute top-3 left-3 rounded px-3 py-1.5 text-[0.75rem] shadow ${
                  grilleVisible ? "bg-amber-700 text-amber-100" : "bg-stone-800/80 hover:bg-stone-700 text-stone-300"
                }`}
                data-testid="btn-afficher-relief"
              >
                {grilleVisible ? "Masquer le relief" : "Afficher le relief"}
              </button>
            </div>

            {/* Collapsible settings */}
            <div className={`bg-stone-800 text-stone-200 shrink-0 overflow-y-auto transition-all ${
              reglagesOuverts ? "w-60 p-3" : "w-10"
            }`}>
              <button
                onClick={() => setReglagesOuverts((v) => !v)}
                className="text-stone-400 hover:text-white text-sm mb-2 w-full text-center"
                data-testid="panneau-reglages"
                title={reglagesOuverts ? "Fermer les réglages" : "Réglages précis"}
              >
                {reglagesOuverts ? "▶" : "◀"}
              </button>
              {reglagesOuverts && (
                <div className="text-[0.75rem]">
                  <h4 className="font-medium mb-3 text-stone-300">Réglages précis</h4>
                  <CurseurPrecis label="Cap" value={cam.cap} unite="°" pas={0.5}
                    onChange={(v) => setCam((c) => ({ ...c, cap: normaliserCap(v) }))}
                    min={0} max={360} step={0.1} testid="slider-cap" />
                  <CurseurPrecis label="Inclinaison" value={cam.inclinaison} unite="°" pas={0.5}
                    onChange={(v) => setCam((c) => ({ ...c, inclinaison: v }))}
                    min={-90} max={90} step={0.1} testid="slider-inclinaison" />
                  <CurseurPrecis label="Roulis" value={cam.roulis} unite="°" pas={0.5}
                    onChange={(v) => setCam((c) => ({ ...c, roulis: v }))}
                    min={-45} max={45} step={0.1} testid="slider-roulis" />
                  <CurseurPrecis label="Hauteur" value={cam.hauteur} unite="m" pas={0.05}
                    onChange={(v) => setCam((c) => ({ ...c, hauteur: v }))}
                    min={0.5} max={10} step={0.05} testid="slider-hauteur" />
                  <CurseurPrecis label="Avant/Arrière" value={0} unite="m" pas={0.05}
                    onChange={deplacerAvant} min={-5} max={5} step={0.05} />
                  <CurseurPrecis label="Gauche/Droite" value={0} unite="m" pas={0.05}
                    onChange={deplacerLateral} min={-5} max={5} step={0.05} />
                  <CurseurPrecis label="Champ de vision" value={cam.fov_v} unite="°" pas={0.5}
                    onChange={(v) => setCam((c) => ({ ...c, fov_v: v }))}
                    min={10} max={120} step={0.5} testid="slider-fov" />
                  <div className="mt-3 pt-3 border-t border-stone-700">
                    <CurseurPrecis label="Opacité photo" value={60} unite="%" pas={5}
                      onChange={() => {}} min={0} max={100} step={5} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {etape === 4 && (
          <div className="flex flex-col items-center justify-center h-full gap-6" data-testid="calage-etape-4">
            <div className="text-6xl">✓</div>
            <h2 className="text-xl font-medium text-stone-200">Le calage est prêt</h2>
            <p className="text-stone-400 text-sm text-center max-w-md">
              La position et l'orientation de la caméra sont enregistrées.
              Vous pouvez maintenant passer au visuel pour voir vos plantations sur la photo.
            </p>
            <button
              onClick={validerCalage}
              className="bg-brass hover:bg-brass-soft text-paper rounded-lg px-8 py-3 font-medium"
              data-testid="btn-valider-calage"
            >
              Valider le calage
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar with navigation */}
      {(etape === 1 || etape === 3) && (
        <div className="flex items-center justify-end gap-3 px-4 py-2 bg-stone-800 shrink-0">
          <button
            onClick={suivant}
            disabled={etape === 1 && (!positionClic || !directionClic)}
            className="bg-brass hover:bg-brass-soft text-paper rounded px-6 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="btn-suivant"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 1 : Plan view with click-to-place camera
// ---------------------------------------------------------------------------

function Etape1Plan({
  orthoUrl, orthoEmprise, batiments, parcelles, zoneContour,
  positionClic, directionClic, fov_v,
  onPositionClic, onDirectionClic,
}: {
  orthoUrl: string | null;
  orthoEmprise: [number, number, number, number] | null;
  batiments: { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }[];
  parcelles: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  zoneContour: [number, number][] | null;
  positionClic: [number, number] | null;
  directionClic: [number, number] | null;
  fov_v: number;
  onPositionClic: (pt: [number, number]) => void;
  onDirectionClic: (pt: [number, number]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [taille, setTaille] = useState({ w: 800, h: 600 });

  // Compute emprise from parcelle or zone
  const emprise = useMemo(() => {
    if (orthoEmprise) return orthoEmprise;
    if (!parcelles) return [0, 0, 30, 20] as [number, number, number, number];
    const rings = parcelles.type === "MultiPolygon"
      ? parcelles.coordinates.flat(1)
      : parcelles.coordinates;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < xMin) xMin = x; if (x > xMax) xMax = x;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
      }
    }
    return [xMin - 5, yMin - 5, xMax + 5, yMax + 5] as [number, number, number, number];
  }, [orthoEmprise, parcelles]);

  // Coordinate conversion: terrain -> canvas pixels
  const terrainVersCanvas = useCallback((x: number, y: number): [number, number] => {
    const [xMin, yMin, xMax, yMax] = emprise;
    const marge = 20;
    const scaleX = (taille.w - marge * 2) / (xMax - xMin);
    const scaleY = (taille.h - marge * 2) / (yMax - yMin);
    const scale = Math.min(scaleX, scaleY);
    const ox = (taille.w - (xMax - xMin) * scale) / 2;
    const oy = (taille.h - (yMax - yMin) * scale) / 2;
    return [ox + (x - xMin) * scale, oy + (yMax - y) * scale]; // Y flipped
  }, [emprise, taille]);

  const canvasVersTerrain = useCallback((cx: number, cy: number): [number, number] => {
    const [xMin, yMin, xMax, yMax] = emprise;
    const marge = 20;
    const scaleX = (taille.w - marge * 2) / (xMax - xMin);
    const scaleY = (taille.h - marge * 2) / (yMax - yMin);
    const scale = Math.min(scaleX, scaleY);
    const ox = (taille.w - (xMax - xMin) * scale) / 2;
    const oy = (taille.h - (yMax - yMin) * scale) / 2;
    return [xMin + (cx - ox) / scale, yMax - (cy - oy) / scale];
  }, [emprise, taille]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setTaille({ w: e.contentRect.width, h: e.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load ortho image
  useEffect(() => {
    if (!orthoUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imageRef.current = img; dessiner(); };
    img.src = orthoUrl;
  }, [orthoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw
  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = taille.w;
    canvas.height = taille.h;

    // Background
    ctx.fillStyle = "#1C1917";
    ctx.fillRect(0, 0, taille.w, taille.h);

    // Ortho image
    const img = imageRef.current;
    if (img && orthoEmprise) {
      const [ox1, oy1] = terrainVersCanvas(orthoEmprise[0], orthoEmprise[1]);
      const [ox2, oy2] = terrainVersCanvas(orthoEmprise[2], orthoEmprise[3]);
      ctx.drawImage(img, Math.min(ox1, ox2), Math.min(oy1, oy2), Math.abs(ox2 - ox1), Math.abs(oy2 - oy1));
    }

    // Building outlines
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    for (const bat of batiments) {
      const rings = bat.geometry.type === "MultiPolygon"
        ? bat.geometry.coordinates.flat(1)
        : bat.geometry.coordinates;
      for (const ring of rings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [cx, cy] = terrainVersCanvas(ring[i][0], ring[i][1]);
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Zone contour
    if (zoneContour && zoneContour.length >= 3) {
      ctx.strokeStyle = "#FF8C00";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (let i = 0; i < zoneContour.length; i++) {
        const [cx, cy] = terrainVersCanvas(zoneContour[i][0], zoneContour[i][1]);
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Position marker
    if (positionClic) {
      const [px, py] = terrainVersCanvas(positionClic[0], positionClic[1]);
      ctx.fillStyle = "#EF4444";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Direction + FOV cone
    if (positionClic && directionClic) {
      const [px, py] = terrainVersCanvas(positionClic[0], positionClic[1]);
      const [dx, dy] = terrainVersCanvas(directionClic[0], directionClic[1]);
      const angle = Math.atan2(dy - py, dx - px);
      const halfFov = (fov_v * Math.PI / 180) / 2;
      const len = 80;

      // FOV cone
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(angle - halfFov) * len, py + Math.sin(angle - halfFov) * len);
      ctx.lineTo(px + Math.cos(angle + halfFov) * len, py + Math.sin(angle + halfFov) * len);
      ctx.closePath();
      ctx.fill();

      // Direction line
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(dx, dy);
      ctx.stroke();

      // Direction marker
      ctx.fillStyle = "#3B82F6";
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [taille, terrainVersCanvas, batiments, zoneContour, positionClic, directionClic, fov_v, orthoEmprise]);

  useEffect(() => { dessiner(); }, [dessiner]);

  // Click handling
  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const [tx, ty] = canvasVersTerrain(cx, cy);

    if (!positionClic) {
      onPositionClic([tx, ty]);
    } else if (!directionClic) {
      onDirectionClic([tx, ty]);
    } else {
      // Re-click: reset direction
      onDirectionClic([tx, ty]);
    }
  }, [positionClic, directionClic, canvasVersTerrain, onPositionClic, onDirectionClic]);

  return (
    <div className="h-full flex flex-col" data-testid="calage-etape-1">
      <div className="text-center py-3 text-stone-300 text-sm">
        {!positionClic
          ? "Cliquez sur le plan pour indiquer votre position"
          : !directionClic
            ? "Cliquez pour indiquer la direction que vous regardiez"
            : "Position et direction définies. Cliquez pour modifier la direction."}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onClick={onClick}
          style={{ cursor: "crosshair" }}
          data-testid="plan-placement"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focale saisie libre
// ---------------------------------------------------------------------------

function FocaleSaisie({ onChoix }: { onChoix: (f: number) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");

  const valider = () => {
    const v = parseFloat(texte.replace(",", "."));
    if (!isNaN(v) && v > 0) onChoix(v);
    setTexte("");
    setOuvert(false);
  };

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="bg-stone-800 hover:bg-stone-700 text-stone-400 rounded-lg px-6 py-3 text-sm"
      >
        Autre focale…
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center bg-stone-800 rounded-lg px-4 py-3">
      <input
        type="text"
        placeholder="Focale en mm"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") valider(); }}
        className="flex-1 bg-stone-900 border border-stone-600 rounded px-3 py-1 text-sm text-stone-200"
        autoFocus
        data-testid="input-focale-custom"
      />
      <button onClick={valider} className="bg-brass text-paper rounded px-4 py-1 text-sm">OK</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CurseurPrecis : slider + boutons −/+ + saisie directe + maintien = répétition
// ---------------------------------------------------------------------------

function CurseurPrecis({
  label, value, unite, pas, onChange, min, max, step, testid,
}: {
  label: string; value: number; unite: string; pas: number;
  onChange: (v: number) => void;
  min: number; max: number; step: number;
  testid?: string;
}) {
  const [saisie, setSaisie] = useState(false);
  const [texte, setTexte] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const startRepeatRef = useCallback((delta: number) => {
    onChange(clamp(valueRef.current + delta));
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onChange(clamp(valueRef.current + delta));
      }, 100);
    }, 400);
  }, [onChange, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRepeat = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  const ouvrirSaisie = () => {
    const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    setSaisie(true);
    setTexte(value.toFixed(dec).replace(".", ","));
  };

  const validerSaisie = () => {
    const parsed = parseFloat(texte.replace(",", "."));
    if (!isNaN(parsed)) onChange(clamp(parsed));
    setSaisie(false);
  };

  const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const affichage = `${value.toFixed(dec)}${unite}`;

  return (
    <div className="mb-2" data-testid={testid ? `curseur-${testid}` : undefined}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[0.7rem] text-stone-400 flex-1">{label}</span>
        <button
          className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 text-[0.8rem] leading-none flex items-center justify-center select-none"
          onPointerDown={() => startRepeatRef(-pas)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          data-testid={testid ? `${testid}-minus` : undefined}
        >−</button>
        {saisie ? (
          <input
            type="text" value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onBlur={validerSaisie}
            onKeyDown={(e) => { if (e.key === "Enter") validerSaisie(); if (e.key === "Escape") setSaisie(false); }}
            className="w-14 text-center bg-stone-900 border border-stone-600 rounded text-[0.7rem] px-1 py-0.5"
            autoFocus data-testid={testid ? `${testid}-input` : undefined}
          />
        ) : (
          <button onClick={ouvrirSaisie}
            className="w-14 text-center text-[0.7rem] text-stone-300 hover:text-white cursor-text"
            data-testid={testid ? `${testid}-value` : undefined}
          >{affichage}</button>
        )}
        <button
          className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 text-[0.8rem] leading-none flex items-center justify-center select-none"
          onPointerDown={() => startRepeatRef(pas)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          data-testid={testid ? `${testid}-plus` : undefined}
        >+</button>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        className="w-full h-1 accent-brass" data-testid={testid}
      />
    </div>
  );
}
