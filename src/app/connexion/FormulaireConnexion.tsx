"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FormulaireConnexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: motDePasse,
      });

      if (error) {
        setErreur("Identifiants incorrects.");
        return;
      }

      router.push("/conception");
      router.refresh();
    } catch {
      setErreur("Identifiants incorrects.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-[0.88rem] font-medium text-ink mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
        />
      </div>

      <div>
        <label htmlFor="mdp" className="block text-[0.88rem] font-medium text-ink mb-1">
          Mot de passe
        </label>
        <input
          id="mdp"
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
        />
      </div>

      {erreur && (
        <p className="text-[0.88rem] text-red-700">{erreur}</p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full px-6 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40"
      >
        {enCours ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
