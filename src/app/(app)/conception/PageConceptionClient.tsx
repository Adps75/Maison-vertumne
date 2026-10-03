"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ProjetResume {
  id: string;
  nom: string;
  adresse: string | null;
  created_at: string;
}

export function PageConceptionClient() {
  const router = useRouter();
  const [projets, setProjets] = useState<ProjetResume[]>([]);
  const [chargement, setChargement] = useState(true);

  // Modale nouveau projet
  const [modale, setModale] = useState(false);
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [coordonnees, setCoordonnees] = useState<{ lat: number; lon: number } | null>(null);
  const [creation, setCreation] = useState(false);

  // Suppression
  const [supprId, setSupprId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/conception/projets")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setProjets(d.projets); })
      .finally(() => setChargement(false));
  }, []);

  // Autocomplétion adresse
  const chercher = useCallback((q: string) => {
    setAdresse(q);
    setCoordonnees(null);
    if (q.length < 3) { setSuggestions([]); return; }
    const timeout = setTimeout(async () => {
      const res = await fetch(
        `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5&index=address`,
      );
      const data = await res.json();
      setSuggestions(
        (data.features ?? []).map((f: { properties: { label: string }; geometry: { coordinates: [number, number] } }) => ({
          label: f.properties.label,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        })),
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const creerProjet = async () => {
    if (!coordonnees) return;
    setCreation(true);
    const res = await fetch("/api/conception/projets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: nom || adresse || "Nouveau projet",
        adresse,
        lat: coordonnees.lat,
        lon: coordonnees.lon,
      }),
    });
    const data = await res.json();
    setCreation(false);
    if (data.ok) {
      router.push(`/conception/${data.id}`);
    }
  };

  const supprimer = async (id: string) => {
    await fetch(`/api/conception/projets/${id}`, { method: "DELETE" });
    setProjets((p) => p.filter((proj) => proj.id !== id));
    setSupprId(null);
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hair-light px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif font-medium text-[1.3rem] text-green-950">Projets</h1>
        <div className="flex items-center gap-4">
          <a href="/conception/bibliotheque" className="text-[0.85rem] text-brass hover:text-brass-soft">
            Bibliothèque
          </a>
          <button
            onClick={() => setModale(true)}
            className="px-4 py-2 bg-brass text-paper text-[0.85rem] font-medium rounded hover:bg-brass-soft transition-colors"
          >
            Nouveau projet
          </button>
          <form action="/api/auth/deconnexion" method="POST">
            <button type="submit" className="text-[0.82rem] text-stone hover:text-brass">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {chargement ? (
          <p className="text-stone">Chargement…</p>
        ) : projets.length === 0 ? (
          <p className="text-stone text-center py-16">Aucun projet pour l'instant.</p>
        ) : (
          <div className="space-y-3">
            {projets.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 bg-white border border-hair-light rounded hover:border-brass transition-colors cursor-pointer"
                onClick={() => router.push(`/conception/${p.id}`)}
              >
                <div>
                  <p className="font-medium text-ink">{p.nom}</p>
                  {p.adresse && <p className="text-[0.82rem] text-stone">{p.adresse}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[0.78rem] text-stone">
                    {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSupprId(p.id); }}
                    className="text-[0.78rem] text-stone hover:text-red-600"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modale nouveau projet */}
      {modale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-paper rounded-lg p-6 w-full max-w-md shadow-lg">
            <h2 className="font-serif font-medium text-xl text-green-950 mb-4">
              Nouveau projet
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[0.88rem] font-medium text-ink mb-1">
                  Nom du projet
                </label>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Optionnel"
                  className="w-full px-3 py-2 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50"
                />
              </div>

              <div className="relative">
                <label className="block text-[0.88rem] font-medium text-ink mb-1">
                  Adresse
                </label>
                <input
                  type="text"
                  value={adresse}
                  onChange={(e) => chercher(e.target.value)}
                  placeholder="12 rue des Jardins, Sceaux"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-hair-light rounded shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <li
                        key={i}
                        onClick={() => {
                          setAdresse(s.label);
                          setCoordonnees({ lat: s.lat, lon: s.lon });
                          setSuggestions([]);
                          if (!nom) setNom(s.label);
                        }}
                        className="px-3 py-2 cursor-pointer text-[0.88rem] hover:bg-paper-2"
                      >
                        {s.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setModale(false); setNom(""); setAdresse(""); setCoordonnees(null); setSuggestions([]); }}
                className="px-4 py-2 text-stone hover:text-ink"
              >
                Annuler
              </button>
              <button
                disabled={!coordonnees || creation}
                onClick={creerProjet}
                className="px-6 py-2 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40"
              >
                {creation ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {supprId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-paper rounded-lg p-6 w-full max-w-sm shadow-lg">
            <p className="text-ink font-medium mb-4">Supprimer ce projet ?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSupprId(null)} className="px-4 py-2 text-stone hover:text-ink">
                Annuler
              </button>
              <button
                onClick={() => supprimer(supprId)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
