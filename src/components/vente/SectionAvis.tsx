import type { Avis } from "@/content/pages/accueil";

interface Props {
  titre: string;
  liste: readonly Avis[];
}

export function SectionAvis({ titre, liste }: Props) {
  if (liste.length === 0) return null;

  return (
    <section className="bg-green-900 text-paper py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)]">
        <div className="flex items-center gap-3.5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-brass">
          <span className="block w-[26px] h-px bg-brass opacity-70" />
          {titre}
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {liste.map((avis, i) => (
            <blockquote
              key={i}
              className="border-t border-hair pt-6"
            >
              <p className="text-[0.95rem] leading-relaxed text-celadon/85">
                &laquo;&nbsp;{avis.texte}&nbsp;&raquo;
              </p>
              <footer className="mt-4 text-[0.82rem] text-stone">
                <span className="font-medium text-paper">{avis.prenom}</span>
                {" — "}{avis.commune}
                {" · "}{avis.note}/5
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
