interface Props {
  titre: string;
  texte: string;
}

export function SectionFondateur({ titre, texte }: Props) {
  return (
    <section className="bg-paper text-ink py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Photo placeholder */}
          <div className="aspect-[3/4] rounded-sm bg-green-800 flex items-center justify-center">
            <span className="text-[0.65rem] font-medium uppercase tracking-[0.24em] text-celadon">
              Photo à venir
            </span>
          </div>

          <div>
            <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass mb-6">
              <span className="block w-[26px] h-px bg-brass opacity-70" />
              Le fondateur
            </div>
            <h2 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.08]">
              {titre}
            </h2>
            <p className="mt-6 text-[1rem] leading-relaxed text-ink/80">
              {texte}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
