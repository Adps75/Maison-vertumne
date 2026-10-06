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
import type { Element, Calque, NomOutil, Accrochage, NumeroEtape } from "../types";
import type { Pt } from "../geo/plan";
import { surface as surfacePoly } from "../geo/plan";
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
  survoleRef: React.RefObject<string | null>;
  poigneeSurvoleRef: React.RefObject<Poignee | null>;
  poigneePreviewRef: React.RefObject<Pt | null>;
  poigneeActive: Poignee | null;
  etape: NumeroEtape;
  zoneActive: string | null;
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
  survoleRef,
  poigneeSurvoleRef,
  poigneePreviewRef,
  poigneeActive,
  etape,
  zoneActive,
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

  // Écouter l'événement de cadrage sur zone
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setZoom(detail.zoom);
        zoomRef.current = detail.zoom;
        setPosition({ x: detail.x, y: detail.y });
      }
    };
    window.addEventListener("cadrer-zone", handler);
    return () => window.removeEventListener("cadrer-zone", handler);
  }, [zoomRef]);

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

          {/* Éléments du plan — couleur du calque, surbrillance survol */}
          {Array.from(elements.values()).map((el) => {
            if (el.type === "zone") return null; // Rendues séparément
            if (!calqueVisible.has(el.calque)) return null;
            const selected = selection.has(el.id);
            const hovered = survoleRef.current === el.id && !selected;
            const calqueColor = calqueCouleurMap.get(el.calque) ?? "#CCCCCC";
            const color = selected ? SELECTION : calqueColor;
            const strokeW = selected ? 4 : hovered ? 3 : 2;
            return renderElement(el, color, strokeW, zoom);
          })}

          {/* Zones de travail — contour pointillé laiton + nom au centroïde */}
          {calqueVisible.has("zones") && Array.from(elements.values())
            .filter((el) => el.type === "zone")
            .map((el) => {
              const pts = el.geometrie.type === "polygone" || el.geometrie.type === "rectangle"
                ? el.geometrie.points : [];
              if (pts.length < 3) return null;
              const selected = selection.has(el.id);
              const isActive = zoneActive === el.id;
              const nom = (el.proprietes?.nom as string) ?? "Zone";

              // Centroïde
              let cx = 0, cy = 0;
              for (const [x, y] of pts) { cx += x; cy += y; }
              cx /= pts.length; cy /= pts.length;
              const ecC = terrainVersEcran({ x: cx, y: cy });

              return (
                <Group key={`zone-${el.id}`}>
                  <Line
                    points={coordonneesVersEcran(pts)}
                    closed
                    stroke={selected ? SELECTION : isActive ? "#B8963C" : LAITON}
                    strokeWidth={selected ? 3 : isActive ? 2.5 : 2}
                    strokeScaleEnabled={false}
                    dash={[10, 6]}
                    fill={isActive ? "rgba(156,124,60,0.06)" : undefined}
                  />
                  <Text
                    x={ecC.x}
                    y={ecC.y}
                    text={nom}
                    fontSize={12 / zoom}
                    fill={LAITON}
                    offsetX={(nom.length * 3.5) / zoom}
                    offsetY={6 / zoom}
                    fontStyle="bold"
                  />
                </Group>
              );
            })}

          {/* Voile extérieur — atténue l'extérieur de la zone active */}
          {zoneActive && (() => {
            const zoneEl = elements.get(zoneActive);
            if (!zoneEl || zoneEl.type !== "zone") return null;
            const pts = zoneEl.geometrie.type === "polygone" || zoneEl.geometrie.type === "rectangle"
              ? zoneEl.geometrie.points : [];
            if (pts.length < 3) return null;

            // Grand rectangle couvrant tout le viewport (en coordonnées terrain)
            const marge = 10000;
            const outerPts: number[] = [
              -marge, marge, marge, marge, marge, -marge, -marge, -marge,
            ];
            // Trou = la zone (inversé Y pour écran)
            const holePts = pts.flatMap(([x, y]) => {
              const ec = terrainVersEcran({ x, y });
              return [ec.x, ec.y];
            });
            // Outer en coordonnées écran
            const outerEc = [
              -marge, -marge, marge, -marge, marge, marge, -marge, marge,
            ];

            return (
              <Group>
                {/* Rectangle extérieur avec trou via clipFunc */}
                <Rect
                  x={-marge}
                  y={-marge}
                  width={marge * 2}
                  height={marge * 2}
                  fill="rgba(255,255,255,0.45)"
                  listening={false}
                  clipFunc={(ctx: CanvasRenderingContext2D) => {
                    // Extérieur (sens horaire)
                    ctx.moveTo(-marge, -marge);
                    ctx.lineTo(marge, -marge);
                    ctx.lineTo(marge, marge);
                    ctx.lineTo(-marge, marge);
                    ctx.closePath();
                    // Trou = zone (sens anti-horaire)
                    const ecPts = pts.map(([x, y]) => terrainVersEcran({ x, y }));
                    if (ecPts.length > 0) {
                      ctx.moveTo(ecPts[ecPts.length - 1].x, ecPts[ecPts.length - 1].y);
                      for (const p of ecPts) {
                        ctx.lineTo(p.x, p.y);
                      }
                      ctx.closePath();
                    }
                  }}
                />
              </Group>
            );
          })()}
        </Layer>

        {/* Couche interactive — tracé en cours, accrochage, fantôme */}
        <Layer ref={interactiveLayerRef} listening={false}>
          {/* Tracé en cours */}
          {traceEnCours.length > 0 && (
            <>
              <Line
                points={coordonneesVersEcran(traceEnCours)}
                stroke={LAITON}
                strokeWidth={2}
                strokeScaleEnabled={false}
                dash={[8, 5]}
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
                      strokeWidth={1.5}
                      strokeScaleEnabled={false}
                      dash={[6, 4]}
                      opacity={0.8}
                    />
                    {d > 0.1 && (
                      <>
                      <Rect
                        x={(ecD.x + ecC.x) / 2 - 40 / zoom}
                        y={(ecD.y + ecC.y) / 2 - 16 / zoom}
                        width={80 / zoom}
                        height={14 / zoom}
                        fill="rgba(0,0,0,0.6)"
                        cornerRadius={2 / zoom}
                      />
                      <Text
                        x={(ecD.x + ecC.x) / 2}
                        y={(ecD.y + ecC.y) / 2 - 14 / zoom}
                        text={`${d.toFixed(2)} m  ${a.toFixed(0)}°`}
                        fontSize={11 / zoom}
                        fill="#FFFFFF"
                      />
                      </>
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

          {/* Poignées des éléments sélectionnés (non interactives — hit-test géré par PageProjetClient) */}
          {outil === "selection" && Array.from(selection).map((selId) => {
            const el = elements.get(selId);
            if (!el) return null;
            const poignees = extrairePoignees(el);
            return poignees.map((p, pi) => {
              const isDragging = poigneeActive?.elementId === p.elementId
                && poigneeActive?.type === p.type
                && poigneeActive?.index === p.index;
              const isHovered = poigneeSurvoleRef.current?.elementId === p.elementId
                && poigneeSurvoleRef.current?.type === p.type
                && poigneeSurvoleRef.current?.index === p.index;

              // Position : si cette poignée est glissée, utiliser la preview
              const pos = isDragging && poigneePreviewRef.current
                ? poigneePreviewRef.current
                : p.point;
              const ec = terrainVersEcran({ x: pos[0], y: pos[1] });
              const taille = p.type === "milieu" ? 3 / zoom : 5 / zoom;
              const fill = isDragging ? "#EF4444"
                : isHovered ? "#60A5FA"
                : p.type === "milieu" ? "#3B82F6" : "#2563EB";

              return (
                <Rect
                  key={`h-${selId}-${pi}`}
                  x={ec.x - taille}
                  y={ec.y - taille}
                  width={taille * 2}
                  height={taille * 2}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={1 / zoom}
                  listening={false}
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

function renderElement(el: Element, color: string, sw: number, zoom: number, fillOpacityOverride?: number): React.ReactNode {
  const key = el.id;
  const lisereSw = sw + 2; // +1px de chaque côté
  const fillColor = color + "33"; // 20% opacity via hex alpha

  // Helper : trait avec liseré sombre
  const trait = (points: number[], closed = false, fill = false) => (
    <Group key={key}>
      {/* Liseré sombre */}
      <Line
        points={points}
        closed={closed}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={lisereSw}
        strokeScaleEnabled={false}
        listening={false}
      />
      {/* Trait principal */}
      <Line
        points={points}
        closed={closed}
        stroke={color}
        strokeWidth={sw}
        strokeScaleEnabled={false}
        fill={fill ? fillColor : undefined}
        listening={false}
      />
    </Group>
  );

  switch (el.geometrie.type) {
    case "polyligne":
      return trait(coordonneesVersEcran(el.geometrie.points));

    case "polygone":
    case "rectangle":
      return trait(coordonneesVersEcran(el.geometrie.points), true, true);

    case "cercle": {
      const pts = cercleVersPolygone(
        el.geometrie.centre[0], el.geometrie.centre[1], el.geometrie.rayon, 64,
      );
      return trait(coordonneesVersEcran(pts), true, true);
    }

    case "arc": {
      const pts = arcVersPoints(
        el.geometrie.centre[0], el.geometrie.centre[1], el.geometrie.rayon,
        el.geometrie.angleDebut, el.geometrie.angleFin, 32,
      );
      return trait(coordonneesVersEcran(pts));
    }

    case "cote": {
      const { p1, p2, decalage, distance: d } = el.geometrie;
      // Direction perpendiculaire
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ? dx / len : 1;

      // Points de la ligne de cote (décalée)
      const c1: Pt = [p1[0] + nx * decalage, p1[1] + ny * decalage];
      const c2: Pt = [p2[0] + nx * decalage, p2[1] + ny * decalage];

      // Traits de rappel
      const rappelExt = decalage > 0 ? decalage + 0.3 : decalage - 0.3;
      const r1a = terrainVersEcran({ x: p1[0], y: p1[1] });
      const r1b = terrainVersEcran({ x: p1[0] + nx * rappelExt, y: p1[1] + ny * rappelExt });
      const r2a = terrainVersEcran({ x: p2[0], y: p2[1] });
      const r2b = terrainVersEcran({ x: p2[0] + nx * rappelExt, y: p2[1] + ny * rappelExt });

      const ec1 = terrainVersEcran({ x: c1[0], y: c1[1] });
      const ec2 = terrainVersEcran({ x: c2[0], y: c2[1] });
      const midX = (ec1.x + ec2.x) / 2;
      const midY = (ec1.y + ec2.y) / 2;

      const texte = d.toFixed(2).replace(".", ",") + " m";

      return (
        <Group key={key}>
          {/* Traits de rappel */}
          <Line points={[r1a.x, r1a.y, r1b.x, r1b.y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
          <Line points={[r2a.x, r2a.y, r2b.x, r2b.y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
          {/* Ligne de cote */}
          <Line points={[ec1.x, ec1.y, ec2.x, ec2.y]} stroke={color} strokeWidth={sw} strokeScaleEnabled={false} />
          {/* Marques aux extrémités */}
          <Line points={[ec1.x - 3 / zoom, ec1.y - 3 / zoom, ec1.x + 3 / zoom, ec1.y + 3 / zoom]} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} />
          <Line points={[ec2.x - 3 / zoom, ec2.y - 3 / zoom, ec2.x + 3 / zoom, ec2.y + 3 / zoom]} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} />
          {/* Texte avec fond */}
          <Rect
            x={midX - (texte.length * 3.5) / zoom}
            y={midY - 8 / zoom}
            width={(texte.length * 7) / zoom}
            height={14 / zoom}
            fill="rgba(255,255,255,0.85)"
            cornerRadius={2 / zoom}
          />
          <Text
            x={midX}
            y={midY}
            text={texte}
            fontSize={11 / zoom}
            fill={color}
            offsetX={(texte.length * 3.2) / zoom}
            offsetY={6 / zoom}
          />
        </Group>
      );
    }

    case "point": {
      const ec = terrainVersEcran({ x: el.geometrie.position[0], y: el.geometrie.position[1] });
      const texte = (el.proprietes?.texte as string) ?? "";
      return (
        <Group key={key}>
          <Circle x={ec.x} y={ec.y} radius={3 / zoom} fill={color} />
          {texte && (
            <>
              <Rect
                x={ec.x + 5 / zoom}
                y={ec.y - 8 / zoom}
                width={(texte.length * 6.5) / zoom}
                height={14 / zoom}
                fill="rgba(255,255,255,0.85)"
                cornerRadius={2 / zoom}
              />
              <Text
                x={ec.x + 6 / zoom}
                y={ec.y - 6 / zoom}
                text={texte}
                fontSize={12 / zoom}
                fill={color}
              />
            </>
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
