import type { Etape } from "@/content/pages/accueil";

interface Props {
  titre: string;
  etapes: readonly Etape[];
}

export function SectionProcessus({ titre, etapes }: Props) {
  return (
    <section className="bg-paper text-ink py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {etapes.map((etape) => (
            <div key={etape.numero} className="border-t border-hair-light pt-6">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.24em] text-stone">
                Étape {etape.numero}
              </p>
              <h3 className="mt-2 font-serif font-medium text-[1.4rem] leading-tight">
                {etape.titre}
              </h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-ink/80">
                {etape.texte}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
