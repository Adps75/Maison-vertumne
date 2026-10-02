"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer, Line, Circle, Text, Group, Image as KImage, Rect } from "react-konva";
import type Konva from "konva";
import {
  terrainVersEcran,
  ecranVersTerrain,
  coordonneesVersEcran,
  distanceTerrain,
  type PointTerrain,
} from "../geo/canevas";
import {
  cercleVersPolygone,
  arcVersPoints,
  longueur as longueurPolyligne,
  dist,
  angleEntrePoints,
} from "../geo/plan";
import type { Element, Calque, NomOutil, Accrochage } from "../types";
import type { Pt } from "../geo/plan";
import { extrairePoignees, type Poignee } from "../editeur/poignees";

interface Batiment {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  hauteur: number | null;
  cleabs: string;
}

interface Props {
  parcelles: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  batiments: Batiment[];
  orthoUrl: string | null;
  orthoEmprise: [number, number, number, number] | null;
  opaciteOrtho: number;
  elements: Map<string, Element>;
  selection: Set<string>;
  calques: Calque[];
  traceEnCours: Pt[];
  outil: NomOutil;
  curseurRef: React.RefObject<Pt>;
  accrochageRef: React.RefObject<Accrochage | null>;
  zoomRef: React.RefObject<number>;
  rectDebut: Pt | null;
  onClicCanevas: (pt: Pt) => void;
  onMouseMove: (pt: Pt) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseUp: (pt: Pt) => void;
  poigneeActive: Poignee | null;
  onPoigneeDebut: (poignee: Poignee) => void;
  onPoigneeFin: (pt: Pt) => void;
}

const LAITON = "#9C7C3C";
const VERT = "#1B2E24";
const SELECTION = "#2563EB";

export function CanevasEditeur({
  parcelles,
  batiments,
  orthoUrl,
  orthoEmprise,
  opaciteOrtho,
  elements,
  selection,
  calques,
  traceEnCours,
  outil,
  curseurRef,
  accrochageRef,
  zoomRef,
  rectDebut,
  onClicCanevas,
  onMouseMove,
  onContextMenu,
  onMouseUp,
  poigneeActive,
  onPoigneeDebut,
  onPoigneeFin,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [taille, setTaille] = useState({ w: 800, h: 600 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Couche interactive — redessinée via requestAnimationFrame
  const interactiveLayerRef = useRef<Konva.Layer>(null);
  const animFrameRef = useRef(0);

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
    if (!parcelles) return;
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
    zoomRef.current = scale;
    setPosition({
      x: taille.w / 2 - ecranCentre.x * scale,
      y: taille.h / 2 - ecranCentre.y * scale,
    });
  }, [parcelles, taille.w, taille.h, zoomRef]);

  // Molette : Cmd/Ctrl + molette = zoom centré sur curseur ; molette seule = pan
  // Le pincement sur pavé tactile Mac envoie ctrlKey + deltaY
  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const evt = e.evt;

      if (evt.ctrlKey || evt.metaKey) {
        // Zoom centré sur le curseur
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const factor = evt.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newZoom = zoom * factor;

        setZoom(newZoom);
        zoomRef.current = newZoom;
        setPosition({
          x: pointer.x - ((pointer.x - position.x) / zoom) * newZoom,
          y: pointer.y - ((pointer.y - position.y) / zoom) * newZoom,
        });
      } else {
        // Pan : défilement à deux doigts
        setPosition({
          x: position.x - evt.deltaX,
          y: position.y - evt.deltaY,
        });
      }
    },
    [zoom, position, zoomRef],
  );

  // Mouvement souris
  const onStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const terrain = ecranVersTerrain({
        x: (pointer.x - position.x) / zoom,
        y: (pointer.y - position.y) / zoom,
      });

      onMouseMove([terrain.x, terrain.y]);

      // Redessiner la couche interactive
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => {
        interactiveLayerRef.current?.batchDraw();
      });
    },
    [position, zoom, onMouseMove],
  );

  // Clic
  const onStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const terrain = ecranVersTerrain({
        x: (pointer.x - position.x) / zoom,
        y: (pointer.y - position.y) / zoom,
      });

      onClicCanevas([terrain.x, terrain.y]);
    },
    [position, zoom, onClicCanevas],
  );

  // Calques visibles
  const calqueVisible = new Set(calques.filter((c) => c.visible).map((c) => c.nom));
  const calqueCouleurMap = new Map(calques.map((c) => [c.nom, c.couleur]));

  // Parcelle rings
  const parcelleRings =
    parcelles?.type === "MultiPolygon"
      ? parcelles.coordinates.flat(1)
      : parcelles?.coordinates ?? [];

  // Échelle graphique
  const echelleM = calculerEchelle(zoom);
  const echellePx = echelleM * zoom;

  return (
    <div ref={containerRef} className="w-full h-full" onContextMenu={onContextMenu}>
      <Stage
        ref={stageRef}
        width={taille.w}
        height={taille.h}
        scaleX={zoom}
        scaleY={zoom}
        x={position.x}
        y={position.y}
        draggable={false}
        onWheel={onWheel}
        onClick={onStageClick}
        onMouseMove={onStageMouseMove}
        onContextMenu={(e) => { e.evt.preventDefault(); }}
        onMouseUp={(e) => {
          const stage = stageRef.current;
          if (!stage) return;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const terrain = ecranVersTerrain({
            x: (pointer.x - position.x) / zoom,
            y: (pointer.y - position.y) / zoom,
          });
          onMouseUp([terrain.x, terrain.y]);
        }}
      >
        {/* Couche statique — orthophoto, parcelle, bâtiments, éléments */}
        <Layer>
          {/* Orthophoto */}
          {image && orthoEmprise && (
            <KImage
              image={image}
              x={orthoEmprise[0]}
              y={-orthoEmprise[3]}
              width={orthoEmprise[2] - orthoEmprise[0]}
              height={orthoEmprise[3] - orthoEmprise[1]}
              opacity={opaciteOrtho}
            />
          )}

          {/* Parcelle */}
          {parcelleRings.map((ring, i) => (
            <Line
              key={`p-${i}`}
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

            let cx = 0, cy = 0, n = 0;
            const firstRing = rings[0] ?? [];
            for (const [x, y] of firstRing) { cx += x; cy += y; n++; }
            if (n > 0) { cx /= n; cy /= n; }
            const ec = terrainVersEcran({ x: cx, y: cy });

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
                  x={ec.x}
                  y={ec.y}
                  text={bat.hauteur != null ? `${bat.hauteur} m` : "h ?"}
                  fontSize={11 / zoom}
                  fill={bat.hauteur != null ? VERT : "#c00"}
                  offsetX={15 / zoom}
                  offsetY={6 / zoom}
                />
              </Group>
            );
          })}

          {/* Éléments du plan — couleur du calque */}
          {Array.from(elements.values()).map((el) => {
            if (!calqueVisible.has(el.calque)) return null;
            const selected = selection.has(el.id);
            const calqueColor = calqueCouleurMap.get(el.calque) ?? "#CCCCCC";
            const color = selected ? SELECTION : calqueColor;
            return renderElement(el, color, zoom);
          })}
        </Layer>

        {/* Couche interactive — tracé en cours, accrochage, fantôme */}
        <Layer ref={interactiveLayerRef} listening={false}>
          {/* Tracé en cours */}
          {traceEnCours.length > 0 && (
            <>
              <Line
                points={coordonneesVersEcran(traceEnCours)}
                stroke={LAITON}
                strokeWidth={1.5 / zoom}
                dash={[6 / zoom, 4 / zoom]}
              />
              {/* Segment fantôme vers le curseur */}
              {(() => {
                const dernierPt = traceEnCours[traceEnCours.length - 1];
                const cur = curseurRef.current ?? dernierPt;
                const ecD = terrainVersEcran({ x: dernierPt[0], y: dernierPt[1] });
                const ecC = terrainVersEcran({ x: cur[0], y: cur[1] });
                const d = dist(dernierPt, cur);
                const a = angleEntrePoints(dernierPt, cur);

                return (
                  <>
                    <Line
                      points={[ecD.x, ecD.y, ecC.x, ecC.y]}
                      stroke={LAITON}
                      strokeWidth={1 / zoom}
                      dash={[4 / zoom, 4 / zoom]}
                      opacity={0.6}
                    />
                    {d > 0.1 && (
                      <Text
                        x={(ecD.x + ecC.x) / 2}
                        y={(ecD.y + ecC.y) / 2 - 14 / zoom}
                        text={`${d.toFixed(2)} m  ${a.toFixed(0)}°`}
                        fontSize={10 / zoom}
                        fill={LAITON}
                      />
                    )}
                  </>
                );
              })()}
              {/* Points du tracé */}
              {traceEnCours.map((pt, i) => {
                const ec = terrainVersEcran({ x: pt[0], y: pt[1] });
                return (
                  <Circle
                    key={i}
                    x={ec.x}
                    y={ec.y}
                    radius={3 / zoom}
                    fill={LAITON}
                  />
                );
              })}
            </>
          )}

          {/* Indicateur d'accrochage */}
          {(() => {
            const acc = accrochageRef.current;
            if (!acc) return null;
            const ec = terrainVersEcran({ x: acc.point[0], y: acc.point[1] });
            const r = 6 / zoom;
            const symbols: Record<string, React.ReactNode> = {
              extremite: <Rect x={ec.x - r} y={ec.y - r} width={r * 2} height={r * 2} stroke="#00cc44" strokeWidth={1.5 / zoom} />,
              milieu: <Line points={[ec.x - r, ec.y, ec.x, ec.y - r, ec.x + r, ec.y]} stroke="#00cc44" strokeWidth={1.5 / zoom} closed />,
              surSegment: <Circle x={ec.x} y={ec.y} radius={r} stroke="#00cc44" strokeWidth={1.5 / zoom} />,
              intersection: <Line points={[ec.x - r, ec.y - r, ec.x + r, ec.y + r]} stroke="#00cc44" strokeWidth={1.5 / zoom} />,
              centre: <Circle x={ec.x} y={ec.y} radius={r} stroke="#00cc44" strokeWidth={1.5 / zoom} dash={[3 / zoom, 3 / zoom]} />,
            };
            return symbols[acc.type] ?? null;
          })()}

          {/* Poignées des éléments sélectionnés */}
          {outil === "selection" && Array.from(selection).map((selId) => {
            const el = elements.get(selId);
            if (!el) return null;
            const poignees = extrairePoignees(el);
            return poignees.map((p, pi) => {
              const ec = terrainVersEcran({ x: p.point[0], y: p.point[1] });
              const taille = p.type === "milieu" ? 3.5 / zoom : 5 / zoom;
              const fill = p.type === "milieu" ? "#3B82F6" : "#2563EB";
              const dragging = poigneeActive?.elementId === p.elementId
                && poigneeActive?.type === p.type
                && poigneeActive?.index === p.index;

              return (
                <Rect
                  key={`h-${selId}-${pi}`}
                  x={ec.x - taille}
                  y={ec.y - taille}
                  width={taille * 2}
                  height={taille * 2}
                  fill={dragging ? "#EF4444" : fill}
                  stroke="#fff"
                  strokeWidth={1 / zoom}
                  listening
                  onMouseDown={() => onPoigneeDebut(p)}
                  onTouchStart={() => onPoigneeDebut(p)}
                />
              );
            });
          })}

          {/* Rectangle de sélection */}
          {rectDebut && (() => {
            const cur = curseurRef.current ?? rectDebut;
            const a = terrainVersEcran({ x: rectDebut[0], y: rectDebut[1] });
            const b = terrainVersEcran({ x: cur[0], y: cur[1] });
            return (
              <Rect
                x={Math.min(a.x, b.x)}
                y={Math.min(a.y, b.y)}
                width={Math.abs(b.x - a.x)}
                height={Math.abs(b.y - a.y)}
                stroke={SELECTION}
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 4 / zoom]}
                fill="rgba(37,99,235,0.05)"
              />
            );
          })()}
        </Layer>

        {/* Couche HUD — échelle, nord (position fixe) */}
        <Layer listening={false}>
          <Group x={(-position.x + 20) / zoom} y={(-position.y + taille.h - 40) / zoom}>
            <Rect x={0} y={0} width={echellePx / zoom} height={4 / zoom} fill={VERT} />
            <Text x={0} y={-14 / zoom} text={`${echelleM} m`} fontSize={11 / zoom} fill={VERT} />
          </Group>
          <Group x={(-position.x + taille.w - 40) / zoom} y={(-position.y + 60) / zoom}>
            <Line points={[0, 20 / zoom, 0, -15 / zoom]} stroke={VERT} strokeWidth={2 / zoom} />
            <Line points={[-5 / zoom, -8 / zoom, 0, -15 / zoom, 5 / zoom, -8 / zoom]} fill={VERT} closed />
            <Text x={-4 / zoom} y={-30 / zoom} text="N" fontSize={12 / zoom} fill={VERT} fontStyle="bold" />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

function renderElement(el: Element, color: string, zoom: number): React.ReactNode {
  const key = el.id;
  const sw = 1.5 / zoom;

  switch (el.geometrie.type) {
    case "polyligne":
      return (
        <Line
          key={key}
          points={coordonneesVersEcran(el.geometrie.points)}
          stroke={color}
          strokeWidth={sw}
        />
      );

    case "polygone":
    case "rectangle":
      return (
        <Line
          key={key}
          points={coordonneesVersEcran(el.geometrie.points)}
          closed
          stroke={color}
          strokeWidth={sw}
          fill={color === LAITON ? "rgba(156,124,60,0.08)" : "rgba(37,99,235,0.08)"}
        />
      );

    case "cercle": {
      const pts = cercleVersPolygone(
        el.geometrie.centre[0],
        el.geometrie.centre[1],
        el.geometrie.rayon,
        64,
      );
      return (
        <Line
          key={key}
          points={coordonneesVersEcran(pts)}
          closed
          stroke={color}
          strokeWidth={sw}
          fill={color === LAITON ? "rgba(156,124,60,0.08)" : "rgba(37,99,235,0.08)"}
        />
      );
    }

    case "arc": {
      const pts = arcVersPoints(
        el.geometrie.centre[0],
        el.geometrie.centre[1],
        el.geometrie.rayon,
        el.geometrie.angleDebut,
        el.geometrie.angleFin,
        32,
      );
      return (
        <Line
          key={key}
          points={coordonneesVersEcran(pts)}
          stroke={color}
          strokeWidth={sw}
        />
      );
    }

    case "point": {
      const ec = terrainVersEcran({ x: el.geometrie.position[0], y: el.geometrie.position[1] });
      const texte = (el.proprietes?.texte as string) ?? "";
      return (
        <Group key={key}>
          <Circle x={ec.x} y={ec.y} radius={3 / zoom} fill={color} />
          {texte && (
            <Text
              x={ec.x + 6 / zoom}
              y={ec.y - 6 / zoom}
              text={texte}
              fontSize={12 / zoom}
              fill={color}
            />
          )}
        </Group>
      );
    }

    default:
      return null;
  }
}

function calculerEchelle(zoom: number): number {
  const ciblePx = 100;
  const m = ciblePx / zoom;
  const magnitude = Math.pow(10, Math.floor(Math.log10(m)));
  const residuel = m / magnitude;
  if (residuel < 2) return magnitude;
  if (residuel < 5) return 2 * magnitude;
  return 5 * magnitude;
}
