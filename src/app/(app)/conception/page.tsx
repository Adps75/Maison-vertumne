import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projets — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default function PageConception() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hair-light px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif font-medium text-[1.3rem] text-green-950">
          Projets
        </h1>
        <form action="/api/auth/deconnexion" method="POST">
          <button
            type="submit"
            className="text-[0.82rem] text-stone hover:text-brass transition-colors"
          >
            Se déconnecter
          </button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 text-center">
        <p className="text-stone text-[0.95rem]">Aucun projet pour l'instant.</p>
        <button
          disabled
          className="mt-6 px-6 py-3 bg-brass text-paper font-medium rounded opacity-40 cursor-not-allowed"
        >
          Nouveau projet
        </button>
      </main>
    </div>
  );
}
