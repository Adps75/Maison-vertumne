"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer, Line, Image as KImage, Text, Group, Circle, Rect } from "react-konva";
import type Konva from "konva";
import {
  terrainVersEcran,
  ecranVersTerrain,
  coordonneesVersEcran,
  distanceTerrain,
  type PointTerrain,
} from "../geo/canevas";

interface Batiment {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  hauteur: number | null;
  cleabs: string;
}

interface Props {
  parcelles: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  batiments: Batiment[];
  orthoUrl: string | null;
  orthoEmprise: [number, number, number, number] | null; // [xMin, yMin, xMax, yMax] en relatif
  surfaceParcelle: number | null;
  onBatimentHauteur?: (cleabs: string, hauteur: number) => void;
}

const LAITON = "#9C7C3C";
const VERT = "#1B2E24";
const PAPER = "#F2F0E9";

export function CanevasConception({
  parcelles,
  batiments,
  orthoUrl,
  orthoEmprise,
  surfaceParcelle,
  onBatimentHauteur,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [taille, setTaille] = useState({ w: 800, h: 600 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Outil de mesure
  const [mesureA, setMesureA] = useState<PointTerrain | null>(null);
  const [mesureB, setMesureB] = useState<PointTerrain | null>(null);
  const [outilMesure, setOutilMesure] = useState(false);

  // Saisie hauteur
  const [saisieHauteur, setSaisieHauteur] = useState<{ cleabs: string; x: number; y: number } | null>(null);
  const [valeurHauteur, setValeurHauteur] = useState("");

  // Redimensionnement
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTaille({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Charger l'image ortho
  useEffect(() => {
    if (!orthoUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.src = orthoUrl;
  }, [orthoUrl]);

  // Centrage initial
  useEffect(() => {
    if (!parcelles || !stageRef.current) return;
    const rings =
      parcelles.type === "MultiPolygon"
        ? parcelles.coordinates.flat(1)
        : parcelles.coordinates;

    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }

    const largeur = xMax - xMin;
    const hauteur = yMax - yMin;
    const marge = 20;
    const scaleX = taille.w / (largeur + marge * 2);
    const scaleY = taille.h / (hauteur + marge * 2);
    const scale = Math.min(scaleX, scaleY);

    const centreX = (xMin + xMax) / 2;
    const centreY = (yMin + yMax) / 2;
    const ecranCentre = terrainVersEcran({ x: centreX, y: centreY });

    setZoom(scale);
    setPosition({
      x: taille.w / 2 - ecranCentre.x * scale,
      y: taille.h / 2 - ecranCentre.y * scale,
    });
  }, [parcelles, taille.w, taille.h]);

  // Zoom à la molette centré sur le curseur
  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = zoom * factor;

      setZoom(newZoom);
      setPosition({
        x: pointer.x - ((pointer.x - position.x) / zoom) * newZoom,
        y: pointer.y - ((pointer.y - position.y) / zoom) * newZoom,
      });
    },
    [zoom, position],
  );

  // Clic
  const onClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!outilMesure) return;
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const terrain = ecranVersTerrain({
        x: (pointer.x - position.x) / zoom,
        y: (pointer.y - position.y) / zoom,
      });

      if (!mesureA) {
        setMesureA(terrain);
        setMesureB(null);
      } else {
        setMesureB(terrain);
      }
    },
    [outilMesure, mesureA, position, zoom],
  );

  // Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMesureA(null);
        setMesureB(null);
        setOutilMesure(false);
        setSaisieHauteur(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Extraire les anneaux pour le dessin
  const parcelleRings =
    parcelles?.type === "MultiPolygon"
      ? parcelles.coordinates.flat(1)
      : parcelles?.coordinates ?? [];

  // Échelle graphique
  const echelleM = calculerEchelle(zoom);
  const echellePx = echelleM * zoom;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* Barre d'outils */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={() => {
            setOutilMesure(!outilMesure);
            setMesureA(null);
            setMesureB(null);
          }}
          className={`px-3 py-1.5 rounded text-[0.82rem] border transition-colors ${
            outilMesure
              ? "bg-brass text-paper border-brass"
              : "bg-white/90 text-ink border-hair-light hover:border-brass"
          }`}
        >
          Mesurer
        </button>
      </div>

      {/* Surface */}
      {surfaceParcelle != null && (
        <div className="absolute top-3 right-3 z-10 bg-white/90 px-3 py-1.5 rounded text-[0.82rem] text-ink border border-hair-light">
          Parcelle : {surfaceParcelle.toLocaleString("fr-FR")} m²
        </div>
      )}

      {/* Mesure */}
      {mesureA && mesureB && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white/95 px-4 py-2 rounded text-[0.9rem] text-ink border border-brass shadow">
          {distanceTerrain(mesureA, mesureB).toFixed(2)} m
        </div>
      )}

      {/* Saisie hauteur */}
      {saisieHauteur && (
        <div
          className="absolute z-20 bg-white border border-hair-light rounded p-2 shadow"
          style={{ left: saisieHauteur.x, top: saisieHauteur.y }}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="Hauteur (m)"
            value={valeurHauteur}
            onChange={(e) => setValeurHauteur(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const h = parseFloat(valeurHauteur);
                if (!isNaN(h) && onBatimentHauteur) {
                  onBatimentHauteur(saisieHauteur.cleabs, h);
                }
                setSaisieHauteur(null);
                setValeurHauteur("");
              }
            }}
            className="w-24 px-2 py-1 border border-hair-light rounded text-sm"
            autoFocus
          />
        </div>
      )}

      <Stage
        ref={stageRef}
        width={taille.w}
        height={taille.h}
        scaleX={zoom}
        scaleY={zoom}
        x={position.x}
        y={position.y}
        draggable
        onDragEnd={(e) => {
          setPosition({ x: e.target.x(), y: e.target.y() });
        }}
        onWheel={onWheel}
        onClick={onClick}
        onTap={onClick as unknown as (evt: Konva.KonvaEventObject<TouchEvent>) => void}
      >
        <Layer>
          {/* Orthophoto */}
          {image && orthoEmprise && (
            <KImage
              image={image}
              x={orthoEmprise[0]}
              y={-orthoEmprise[3]} // Y écran = -Y terrain (coin nord-ouest)
              width={orthoEmprise[2] - orthoEmprise[0]}
              height={orthoEmprise[3] - orthoEmprise[1]}
            />
          )}

          {/* Parcelle */}
          {parcelleRings.map((ring, i) => (
            <Line
              key={`parcelle-${i}`}
              points={coordonneesVersEcran(ring)}
              closed
              stroke={LAITON}
              strokeWidth={2 / zoom}
              dash={[8 / zoom, 5 / zoom]}
              fillEnabled={false}
            />
          ))}

          {/* Bâtiments */}
          {batiments.map((bat) => {
            const rings =
              bat.geometry.type === "MultiPolygon"
                ? bat.geometry.coordinates.flat(1)
                : bat.geometry.coordinates;

            // Centre pour le texte
            let cx = 0, cy = 0, n = 0;
            const firstRing = rings[0] ?? [];
            for (const [x, y] of firstRing) {
              cx += x; cy += y; n++;
            }
            if (n > 0) { cx /= n; cy /= n; }
            const ecranCentre = terrainVersEcran({ x: cx, y: cy });

            return (
              <Group key={bat.cleabs}>
                {rings.map((ring, ri) => (
                  <Line
                    key={ri}
                    points={coordonneesVersEcran(ring)}
                    closed
                    stroke={VERT}
                    strokeWidth={1.5 / zoom}
                    fill="rgba(26,39,31,0.15)"
                  />
                ))}
                <Text
                  x={ecranCentre.x}
                  y={ecranCentre.y}
                  text={bat.hauteur != null ? `${bat.hauteur} m` : "h ?"}
                  fontSize={11 / zoom}
                  fill={bat.hauteur != null ? VERT : "#c00"}
                  offsetX={15 / zoom}
                  offsetY={6 / zoom}
                  onClick={(e) => {
                    if (bat.hauteur == null) {
                      e.cancelBubble = true;
                      const stage = stageRef.current;
                      const pointer = stage?.getPointerPosition();
                      if (pointer) {
                        setSaisieHauteur({ cleabs: bat.cleabs, x: pointer.x, y: pointer.y });
                        setValeurHauteur("");
                      }
                    }
                  }}
                />
              </Group>
            );
          })}

          {/* Mesure */}
          {mesureA && (
            <Circle
              x={terrainVersEcran(mesureA).x}
              y={terrainVersEcran(mesureA).y}
              radius={4 / zoom}
              fill={LAITON}
            />
          )}
          {mesureA && mesureB && (
            <>
              <Line
                points={[
                  terrainVersEcran(mesureA).x,
                  terrainVersEcran(mesureA).y,
                  terrainVersEcran(mesureB).x,
                  terrainVersEcran(mesureB).y,
                ]}
                stroke={LAITON}
                strokeWidth={2 / zoom}
              />
              <Circle
                x={terrainVersEcran(mesureB).x}
                y={terrainVersEcran(mesureB).y}
                radius={4 / zoom}
                fill={LAITON}
              />
            </>
          )}
        </Layer>

        {/* Échelle et nord — couche fixe (non zoomée) */}
        <Layer listening={false}>
          <Group x={(-position.x) / zoom} y={(-position.y + taille.h - 40) / zoom}>
            <Rect
              x={20 / zoom}
              y={0}
              width={echellePx / zoom}
              height={4 / zoom}
              fill={VERT}
            />
            <Text
              x={20 / zoom}
              y={-14 / zoom}
              text={`${echelleM} m`}
              fontSize={11 / zoom}
              fill={VERT}
            />
          </Group>

          {/* Flèche nord */}
          <Group x={(-position.x + taille.w - 40) / zoom} y={(-position.y + 60) / zoom}>
            <Line
              points={[0, 20 / zoom, 0, -15 / zoom]}
              stroke={VERT}
              strokeWidth={2 / zoom}
            />
            <Line
              points={[-5 / zoom, -8 / zoom, 0, -15 / zoom, 5 / zoom, -8 / zoom]}
              fill={VERT}
              closed
            />
            <Text
              x={-4 / zoom}
              y={-30 / zoom}
              text="N"
              fontSize={12 / zoom}
              fill={VERT}
              fontStyle="bold"
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

/** Calcule une longueur d'échelle graphique arrondie. */
function calculerEchelle(zoom: number): number {
  const ciblePx = 100;
  const m = ciblePx / zoom;
  const magnitude = Math.pow(10, Math.floor(Math.log10(m)));
  const residuel = m / magnitude;
  if (residuel < 2) return magnitude;
  if (residuel < 5) return 2 * magnitude;
  return 5 * magnitude;
}
