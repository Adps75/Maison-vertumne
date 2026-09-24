import type { Realisation } from "@/content/pages/accueil";

interface Props {
  titre: string;
  liste: readonly Realisation[];
}

export function SectionRealisations({ titre, liste }: Props) {
  if (liste.length === 0) return null;

  return (
    <section className="bg-paper text-ink py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {liste.map((r, i) => (
            <div
              key={i}
              className="border border-hair-light rounded-sm overflow-hidden"
            >
              <div className="aspect-[4/3] bg-green-800" />
              <div className="p-5">
                <p className="font-serif font-medium text-[1.1rem]">
                  {r.commune}
                </p>
                <p className="mt-1 text-[0.82rem] text-stone">{r.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
