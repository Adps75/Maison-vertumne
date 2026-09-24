import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales — Maison Vertumne",
};

export default function PageMentionsLegales() {
  return (
    <main className="flex-1 mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] py-24">
      <h1 className="font-serif font-medium text-[2rem] text-green-950">
        Mentions légales
      </h1>
      <p className="mt-6 text-stone">
        Contenu à compléter.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block text-brass font-medium hover:text-brass-soft transition-colors"
      >
        &larr; Retour à l'accueil
      </Link>
    </main>
  );
}
