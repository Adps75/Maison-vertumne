import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Estimation en ligne — Maison Vertumne",
  description: "Estimez gratuitement votre projet d'aménagement extérieur.",
};

export default function PageEstimation() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
      <h1 className="font-serif font-medium text-[clamp(2rem,5vw,3rem)] text-green-950">
        Estimation en ligne
      </h1>
      <p className="mt-4 text-[1.05rem] text-stone max-w-[40ch]">
        Bientôt disponible. Vous pourrez estimer votre projet en quelques minutes.
      </p>
      <Link
        href="/"
        className="mt-8 text-brass font-medium hover:text-brass-soft transition-colors"
      >
        &larr; Retour à l'accueil
      </Link>
    </main>
  );
}
