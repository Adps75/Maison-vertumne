"use client";

import type { Materiau } from "../materiaux/materiaux";

/** Pastille d'un matériau : couleur et hachure (surface), ou trait (linéaire). */
export function ApercuMateriau({ materiau: m }: { materiau: Materiau }) {
  const id = `motif-${m.id}`;
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" className="shrink-0 rounded-sm border border-hair-light" aria-hidden="true">
      {m.type === "lineaire" ? (
        <>
          <rect width="22" height="14" fill="#ffffff" />
          <line x1="2" y1="7" x2="20" y2="7" stroke={m.couleur} strokeWidth={m.largeur_m && m.largeur_m >= 0.08 ? 4 : 2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <defs>
            <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse">
              {m.hachure === "diagonale" && <path d="M0 5 L5 0" stroke="#00000055" strokeWidth="0.8" />}
              {m.hachure === "croisee" && <path d="M0 5 L5 0 M0 0 L5 5" stroke="#00000055" strokeWidth="0.8" />}
              {m.hachure === "points" && <circle cx="2.5" cy="2.5" r="0.8" fill="#00000066" />}
            </pattern>
          </defs>
          <rect width="22" height="14" fill={m.couleur} fillOpacity="0.55" />
          {m.hachure !== "aucune" && <rect width="22" height="14" fill={`url(#${id})`} />}
        </>
      )}
    </svg>
  );
}
