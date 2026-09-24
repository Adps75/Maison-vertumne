import Link from "next/link";

interface Props {
  surtitre: string;
  titre: string;
  sousTitreAccent: string;
  sousTitre: string;
  bouton: string;
  sousBouton: string;
  preuves: readonly string[];
}

export function SectionAccueil({
  surtitre,
  titre,
  sousTitreAccent,
  sousTitre,
  bouton,
  sousBouton,
  preuves,
}: Props) {
  return (
    <section className="bg-green-950 text-paper min-h-[85vh] flex flex-col justify-center relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_80%_at_50%_18%,rgba(189,201,180,.10),transparent_55%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] py-[clamp(72px,11vw,140px)] text-center">
        <p className="text-[0.7rem] font-sans font-medium uppercase tracking-[0.32em] text-celadon">
          {surtitre}
        </p>

        <h1 className="mt-8 font-serif font-medium text-[clamp(2.4rem,7vw,4.5rem)] leading-[1.02] tracking-[0.01em]">
          {titre}
        </h1>

        <div className="mt-6 mx-auto max-w-[52ch]">
          <p className="font-serif italic text-[clamp(1.3rem,3vw,1.7rem)] leading-snug text-brass-soft">
            {sousTitreAccent}
          </p>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-celadon/90">
            {sousTitre}
          </p>
        </div>

        <div className="mt-10">
          <Link
            href="/estimation"
            className="inline-block bg-brass px-8 py-4 text-paper font-medium rounded hover:bg-brass-soft transition-colors"
          >
            {bouton}
          </Link>
          <p className="mt-3 text-[0.8rem] text-stone">
            {sousBouton}
          </p>
        </div>

        <p className="mt-12 text-[0.72rem] font-medium uppercase tracking-[0.2em] text-celadon/70">
          {preuves.join(" · ")}
        </p>
      </div>
    </section>
  );
}
