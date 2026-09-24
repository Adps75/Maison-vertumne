interface Props {
  titre: string;
  texte: string;
}

export function SectionPourQui({ titre, texte }: Props) {
  return (
    <section className="bg-paper text-ink py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <h2 className="font-serif font-medium text-[clamp(2rem,5vw,3.2rem)] leading-[1.06] max-w-[22ch]">
          {titre}
        </h2>
        <p className="mt-8 text-[1.05rem] leading-relaxed text-ink/85 max-w-[58ch]">
          {texte}
        </p>
      </div>
    </section>
  );
}
