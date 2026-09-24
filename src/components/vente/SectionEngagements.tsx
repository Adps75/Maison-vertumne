import type { Engagement } from "@/content/pages/accueil";

interface Props {
  titre: string;
  liste: readonly Engagement[];
}

export function SectionEngagements({ titre, liste }: Props) {
  return (
    <section className="bg-green-900 text-paper py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-10">
          {liste.map((engagement) => (
            <div key={engagement.titre} className="border-t border-hair pt-6">
              <h3 className="font-serif font-medium text-[1.35rem] leading-tight">
                <em className="italic text-brass-soft">{engagement.titre}</em>
              </h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-celadon/85">
                {engagement.texte}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
