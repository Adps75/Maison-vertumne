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
import { FORMES_EXISTANT, LIBELLES_FORMES_EXISTANT, type FormeExistant } from "../composition/schemas";

interface Props {
  selection: Element[];
  /** Modification d'un élément (action annulable). */
  onModifier?: (el: Element) => void;
}

/** Valeur numérique saisie (virgule acceptée), bornée ; null si invalide. */
function lireNombre(texte: string, min: number, max: number): number | null {
  const v = parseFloat(texte.replace(",", "."));
  return Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null;
}

export function PanneauInfos({ selection, onModifier }: Props) {
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

          {el.hauteur != null && !(el.type === "vegetal" && el.statut === "existant" && onModifier) && (
            <div className="flex justify-between">
              <dt className="text-stone">Hauteur</dt>
              <dd className="text-ink">{el.hauteur} m</dd>
            </div>
          )}

          {/* Végétal existant : volume qui masque les plantes situées derrière (Visuel, rendu IA) */}
          {el.type === "vegetal" && el.statut === "existant" && onModifier && (
            <div className="pt-1 mt-1 border-t border-hair-light space-y-1.5" data-testid="proprietes-existant">
              <div className="flex justify-between items-center gap-2">
                <dt className="text-stone">Forme</dt>
                <dd>
                  <select className="border border-hair-light rounded px-1 py-0.5 text-[0.75rem] bg-white" data-testid="existant-forme-plan"
                    value={(el.proprietes.forme_existant as FormeExistant) ?? "boule"}
                    onChange={(e) => onModifier({ ...el, proprietes: { ...el.proprietes, forme_existant: e.target.value } })}>
                    {FORMES_EXISTANT.map((f) => <option key={f} value={f}>{LIBELLES_FORMES_EXISTANT[f]}</option>)}
                  </select>
                </dd>
              </div>
              <div className="flex justify-between items-center gap-2">
                <dt className="text-stone">Hauteur</dt>
                <dd><input key={`h-${el.id}-${el.hauteur}`} className="w-16 border border-hair-light rounded px-1 py-0.5 text-[0.75rem] text-right" defaultValue={String(el.hauteur ?? 1).replace(".", ",")}
                  aria-label="Hauteur (m)" data-testid="existant-hauteur-plan"
                  onBlur={(e) => { const v = lireNombre(e.target.value, 0.1, 40); if (v !== null && v !== el.hauteur) onModifier({ ...el, hauteur: v, proprietes: { ...el.proprietes, hauteur_m: v } }); }} /> m</dd>
              </div>
              <div className="flex justify-between items-center gap-2">
                <dt className="text-stone">{el.proprietes.forme_existant === "haie" ? "Épaisseur" : "Diamètre"}</dt>
                <dd><input key={`d-${el.id}-${el.proprietes.diametre_m}`} className="w-16 border border-hair-light rounded px-1 py-0.5 text-[0.75rem] text-right" defaultValue={String(el.proprietes.diametre_m ?? 1).replace(".", ",")}
                  aria-label="Diamètre (m)" data-testid="existant-diametre-plan"
                  onBlur={(e) => { const v = lireNombre(e.target.value, 0.1, 40); if (v !== null && v !== el.proprietes.diametre_m) onModifier({ ...el, proprietes: { ...el.proprietes, diametre_m: v } }); }} /> m</dd>
              </div>
              {el.proprietes.forme_existant === "haie" && (
                <>
                  <div className="flex justify-between items-center gap-2">
                    <dt className="text-stone">Longueur</dt>
                    <dd><input key={`l-${el.id}-${el.proprietes.longueur_m}`} className="w-16 border border-hair-light rounded px-1 py-0.5 text-[0.75rem] text-right" defaultValue={String(el.proprietes.longueur_m ?? 2).replace(".", ",")}
                      aria-label="Longueur (m)"
                      onBlur={(e) => { const v = lireNombre(e.target.value, 0.1, 200); if (v !== null) onModifier({ ...el, proprietes: { ...el.proprietes, longueur_m: v } }); }} /> m</dd>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <dt className="text-stone">Orientation</dt>
                    <dd><input key={`o-${el.id}-${el.proprietes.orientation_deg}`} className="w-16 border border-hair-light rounded px-1 py-0.5 text-[0.75rem] text-right" defaultValue={String(el.proprietes.orientation_deg ?? 0)}
                      aria-label="Orientation (degrés, depuis l'est)"
                      onBlur={(e) => { const v = lireNombre(e.target.value, -360, 360); if (v !== null) onModifier({ ...el, proprietes: { ...el.proprietes, orientation_deg: v } }); }} /> °</dd>
                  </div>
                </>
              )}
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
