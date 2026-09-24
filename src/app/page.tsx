const couleurs = [
  { nom: "Green 950", classe: "bg-green-950", texte: "text-paper" },
  { nom: "Green 900", classe: "bg-green-900", texte: "text-paper" },
  { nom: "Green 800", classe: "bg-green-800", texte: "text-paper" },
  { nom: "Green 600", classe: "bg-green-600", texte: "text-paper" },
  { nom: "Paper", classe: "bg-paper", texte: "text-ink" },
  { nom: "Paper 2", classe: "bg-paper-2", texte: "text-ink" },
  { nom: "Céladon", classe: "bg-celadon", texte: "text-ink" },
  { nom: "Laiton", classe: "bg-brass", texte: "text-paper" },
  { nom: "Laiton doux", classe: "bg-brass-soft", texte: "text-paper" },
  { nom: "Encre (ink)", classe: "bg-ink", texte: "text-paper" },
  { nom: "Pierre (stone)", classe: "bg-stone", texte: "text-paper" },
];

export default function Home() {
  return (
    <main className="flex-1 px-6 py-16 max-w-3xl mx-auto">
      <h1 className="font-serif text-5xl font-medium tracking-tight text-green-950">
        Maison <em className="text-brass">Vertumne</em>
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-stone max-w-prose">
        Des jardins à l'esthétique soignée, faits pour durer, adaptés à leur sol
        et leur climat. Cette page vérifie que les couleurs, les polices et les
        tokens Tailwind de la charte graphique sont bien appliqués.
      </p>

      <button className="mt-8 px-6 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors">
        Demander une estimation
      </button>

      <h2 className="font-serif text-2xl font-medium mt-16 mb-6 text-green-900">
        Palette de couleurs
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {couleurs.map((c) => (
          <div
            key={c.nom}
            className={`${c.classe} ${c.texte} rounded p-4 text-sm font-medium border border-hair-light`}
          >
            {c.nom}
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-hair pt-6">
        <p className="text-sm text-stone">
          <span className="font-serif italic text-lg text-ink">
            Cormorant Garamond
          </span>{" "}
          pour les titres ·{" "}
          <span className="font-sans text-ink">Archivo</span> pour le texte
          courant.
        </p>
      </div>
    </main>
  );
}
