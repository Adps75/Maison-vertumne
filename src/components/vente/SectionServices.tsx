import type { ServiceBloc } from "@/content/pages/accueil";

interface Props {
  titre: string;
  blocs: readonly ServiceBloc[];
}

export function SectionServices({ titre, blocs }: Props) {
  return (
    <section className="bg-green-900 text-paper py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {blocs.map((bloc) => (
            <div key={bloc.titre}>
              <h3 className="font-serif font-medium text-[1.6rem] leading-tight">
                <em className="italic text-brass-soft">{bloc.titre}</em>
              </h3>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-celadon/85">
                {bloc.texte}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
