"use client";

import type { TypeLieu } from "@/lib/types/estimation";

interface Props {
  onChoisir: (type: TypeLieu) => void;
}

const options: { type: TypeLieu; titre: string; description: string }[] = [
  {
    type: "maison",
    titre: "Le jardin d'une maison",
    description:
      "Jardin, terrasse de plain-pied, allées, clôtures, aménagement complet.",
  },
  {
    type: "appartement",
    titre: "Une terrasse, un toit-terrasse ou un balcon",
    description:
      "Balcon, terrasse d'appartement ou toit-terrasse en copropriété.",
  },
];

export function EtapeTypeLieu({ onChoisir }: Props) {
  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Votre projet concerne :
      </h1>
      <p className="mt-2 text-stone text-[0.95rem]">
        Choisissez le type d'espace à aménager.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {options.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onChoisir(opt.type)}
            className="text-left p-6 border border-hair-light rounded bg-white hover:border-brass hover:shadow-sm transition-all group"
          >
            <h2 className="font-serif font-medium text-[1.2rem] text-green-950 group-hover:text-brass transition-colors">
              {opt.titre}
            </h2>
            <p className="mt-2 text-[0.88rem] text-stone leading-relaxed">
              {opt.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
