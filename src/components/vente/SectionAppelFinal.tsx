import Link from "next/link";

interface Props {
  titre: string;
  bouton: string;
}

export function SectionAppelFinal({ titre, bouton }: Props) {
  return (
    <section className="bg-green-950 text-paper py-[clamp(72px,11vw,140px)]">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] text-center">
        <h2 className="font-serif font-medium text-[clamp(2rem,5vw,3.5rem)] leading-[1.04]">
          {titre}
        </h2>
        <div className="mt-10">
          <Link
            href="/estimation"
            className="inline-block bg-brass px-8 py-4 text-paper font-medium rounded hover:bg-brass-soft transition-colors"
          >
            {bouton}
          </Link>
        </div>
      </div>
    </section>
  );
}
