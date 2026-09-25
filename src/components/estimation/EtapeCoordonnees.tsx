"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { DonneesEstimation } from "@/lib/types/estimation";
import { schemaCoordonnees } from "@/lib/validation/coordonnees";

interface Props {
  donnees: DonneesEstimation;
  onValider: (maj: Partial<DonneesEstimation> & { leadId: string }) => void;
  onRetour: () => void;
}

export function EtapeCoordonnees({ donnees, onValider, onRetour }: Props) {
  const [prenom, setPrenom] = useState(donnees.prenom ?? "");
  const [email, setEmail] = useState(donnees.email ?? "");
  const [telephone, setTelephone] = useState(donnees.telephone ?? "");
  const [consentement, setConsentement] = useState(false);
  const [piege, setPiege] = useState("");
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  // Anti-spam temporel : enregistre le moment d'affichage
  const montageRef = useRef(Date.now());
  useEffect(() => {
    montageRef.current = Date.now();
  }, []);

  const soumettre = async () => {
    setErreurs({});
    setErreurServeur(null);

    // Validation Zod côté client
    const result = schemaCoordonnees.safeParse({
      prenom,
      email,
      telephone,
      consentement,
    });

    if (!result.success) {
      const champs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const clef = String(issue.path[0] ?? "");
        if (!champs[clef]) champs[clef] = issue.message;
      }
      setErreurs(champs);
      return;
    }

    setEnCours(true);

    try {
      const duree = Date.now() - montageRef.current;

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Champ piège
          adp_verif: piege,
          _duree: duree,

          // Données du parcours
          type_lieu: donnees.typeLieu,
          adresse_label: donnees.adresseLabel,
          lat: donnees.lat,
          lon: donnees.lon,
          code_insee: donnees.codeInsee,
          parcelle_geojson: donnees.parcelle?.geometry ?? null,
          surface_parcelle: donnees.surfaceParcelle ?? null,

          prenom,
          email,
          telephone,

          // Identifiant du lead en cours (pour update au lieu de insert)
          lead_id: donnees.leadId ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErreurServeur(data.error ?? "Une erreur est survenue.");
        return;
      }

      onValider({
        prenom,
        email,
        telephone,
        leadId: data.id,
      });
    } catch {
      setErreurServeur("Impossible d'enregistrer vos coordonnées. Vérifiez votre connexion.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Vos coordonnées
      </h1>
      <p className="mt-2 text-stone text-[0.95rem]">
        Pour vous envoyer votre estimation et vous recontacter si besoin.
      </p>

      <div className="mt-8 max-w-md space-y-5">
        {/* Prénom */}
        <div>
          <label htmlFor="prenom" className="block text-[0.88rem] font-medium text-ink mb-1">
            Prénom
          </label>
          <input
            id="prenom"
            type="text"
            autoComplete="given-name"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
          />
          {erreurs.prenom && <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.prenom}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-[0.88rem] font-medium text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
          />
          {erreurs.email && <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.email}</p>}
        </div>

        {/* Téléphone */}
        <div>
          <label htmlFor="telephone" className="block text-[0.88rem] font-medium text-ink mb-1">
            Téléphone
          </label>
          <input
            id="telephone"
            type="tel"
            autoComplete="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
          />
          {erreurs.telephone && <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.telephone}</p>}
        </div>

        {/* Champ piège (invisible) */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
          <input
            type="text"
            name="adp_verif"
            tabIndex={-1}
            autoComplete="off"
            value={piege}
            onChange={(e) => setPiege(e.target.value)}
          />
        </div>

        {/* Consentement */}
        <div className="flex items-start gap-3">
          <input
            id="consentement"
            type="checkbox"
            checked={consentement}
            onChange={(e) => setConsentement(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-hair-light text-brass focus:ring-brass/50"
          />
          <label htmlFor="consentement" className="text-[0.84rem] text-ink leading-snug">
            J'accepte que mes données soient utilisées pour traiter ma demande
            d'estimation et être recontacté par Atelier des Prés.
            Voir la{" "}
            <Link href="/confidentialite" className="text-brass hover:text-brass-soft underline">
              politique de confidentialité
            </Link>
            .
          </label>
        </div>
        {erreurs.consentement && (
          <p className="text-[0.82rem] text-red-700">{erreurs.consentement}</p>
        )}

        {/* Erreur serveur */}
        {erreurServeur && (
          <div className="p-3 bg-paper-2 border border-hair-light rounded">
            <p className="text-[0.88rem] text-ink">{erreurServeur}</p>
          </div>
        )}
      </div>

      {/* Boutons */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onRetour}
          className="text-brass font-medium hover:text-brass-soft transition-colors"
        >
          &larr; Retour
        </button>
        <button
          disabled={enCours}
          onClick={soumettre}
          className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enCours ? "Envoi…" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
