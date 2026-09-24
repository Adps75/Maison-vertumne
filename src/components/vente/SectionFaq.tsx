import type { FaqItem } from "@/content/pages/accueil";

interface Props {
  titre: string;
  items: readonly FaqItem[];
}

export function SectionFaq({ titre, items }: Props) {
  return (
    <section className="bg-paper text-ink py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 max-w-[720px]">
          {items.map((item, i) => (
            <details
              key={i}
              className="group border-b border-hair-light"
            >
              <summary className="flex cursor-pointer items-center justify-between py-5 text-[1.05rem] font-serif font-medium leading-snug select-none [&::-webkit-details-marker]:hidden list-none">
                {item.question}
                <span className="ml-4 shrink-0 text-brass transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-6 text-[0.95rem] leading-relaxed text-ink/80">
                {item.reponse}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
