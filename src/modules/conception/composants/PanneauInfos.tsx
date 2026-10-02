"use client";

import type { Element } from "../types";
import {
  surface,
  perimetre,
  longueur,
  surfaceCercle,
  longueurArc,
  cercleVersPolygone,
} from "../geo/plan";

interface Props {
  selection: Element[];
}

export function PanneauInfos({ selection }: Props) {
  if (selection.length === 0) return null;

  const el = selection[0];
  const multi = selection.length > 1;

  return (
    <div className="absolute bottom-14 right-3 z-10 bg-white/95 rounded shadow-sm border border-hair-light p-3 w-56">
      <p className="text-[0.7rem] font-medium text-stone uppercase tracking-wider mb-2">
        {multi ? `${selection.length} éléments` : "Propriétés"}
      </p>

      {!multi && (
        <dl className="text-[0.78rem] space-y-1">
          <div className="flex justify-between">
            <dt className="text-stone">Type</dt>
            <dd className="text-ink">{el.type}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone">Calque</dt>
            <dd className="text-ink">{el.calque}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone">Statut</dt>
            <dd className="text-ink">{el.statut}</dd>
          </div>

          {/* Mesures */}
          {el.geometrie.type === "polygone" || el.geometrie.type === "rectangle" ? (
            <>
              <div className="flex justify-between">
                <dt className="text-stone">Surface</dt>
                <dd className="text-ink" data-testid="info-surface">{surface(el.geometrie.points).toFixed(2)} m²</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">Périmètre</dt>
                <dd className="text-ink">{perimetre(el.geometrie.points).toFixed(2)} m</dd>
              </div>
            </>
          ) : null}

          {el.geometrie.type === "polyligne" ? (
            <div className="flex justify-between">
              <dt className="text-stone">Longueur</dt>
              <dd className="text-ink">{longueur(el.geometrie.points).toFixed(2)} m</dd>
            </div>
          ) : null}

          {el.geometrie.type === "cercle" ? (
            <>
              <div className="flex justify-between">
                <dt className="text-stone">Rayon</dt>
                <dd className="text-ink">{el.geometrie.rayon.toFixed(2)} m</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">Surface</dt>
                <dd className="text-ink">{surfaceCercle(el.geometrie.rayon).toFixed(2)} m²</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">Périmètre</dt>
                <dd className="text-ink">{perimetre(cercleVersPolygone(el.geometrie.centre[0], el.geometrie.centre[1], el.geometrie.rayon)).toFixed(2)} m</dd>
              </div>
            </>
          ) : null}

          {el.geometrie.type === "arc" ? (
            <div className="flex justify-between">
              <dt className="text-stone">Longueur</dt>
              <dd className="text-ink">
                {longueurArc(el.geometrie.rayon, el.geometrie.angleDebut, el.geometrie.angleFin).toFixed(2)} m
              </dd>
            </div>
          ) : null}

          {el.hauteur != null && (
            <div className="flex justify-between">
              <dt className="text-stone">Hauteur</dt>
              <dd className="text-ink">{el.hauteur} m</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
