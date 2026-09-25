import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-green-950 text-celadon py-16">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] text-center">
        <p className="font-serif font-medium text-[1.4rem] tracking-[0.06em] text-paper">
          Atelier <em className="italic text-brass">des Prés</em>
        </p>
        <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.3em]">
          Paysagiste · Le Plessis-Robinson et sud parisien
        </p>
        <div className="mt-8 border-t border-hair pt-6">
          <Link
            href="/mentions-legales"
            className="text-[0.78rem] text-stone hover:text-celadon transition-colors"
          >
            Mentions légales
          </Link>
        </div>
      </div>
    </footer>
  );
}
