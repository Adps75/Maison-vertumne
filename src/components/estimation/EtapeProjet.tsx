"use client";

import { useState } from "react";
import type { DonneesEstimation, TypeLieu } from "@/lib/types/estimation";
import {
  amenagementsPourLieu,
  tranchesPourLieu,
  medianeParCode,
} from "@/config/amenagements";
import {
  schemaProjetMaison,
  schemaProjetAppartement,
} from "@/lib/validation/projet";

interface Props {
  typeLieu: TypeLieu;
  donnees: DonneesEstimation;
  onValider: (maj: Partial<DonneesEstimation>) => void;
  onRetour: () => void;
}

const OPTIONS_ORIENTATION = [
  { code: "nord", libelle: "Nord" },
  { code: "nord_est", libelle: "Nord-est" },
  { code: "est", libelle: "Est" },
  { code: "sud_est", libelle: "Sud-est" },
  { code: "sud", libelle: "Sud" },
  { code: "sud_ouest", libelle: "Sud-ouest" },
  { code: "ouest", libelle: "Ouest" },
  { code: "nord_ouest", libelle: "Nord-ouest" },
  { code: "ne_sait_pas", libelle: "Je ne sais pas" },
];

const OPTIONS_ACCES = [
  { code: "ascenseur", libelle: "Ascenseur utilisable pour le matériel" },
  { code: "escalier", libelle: "Escalier uniquement" },
  { code: "monte_charge", libelle: "Monte-charge" },
  { code: "exterieur", libelle: "Accès par l'extérieur" },
];

const OPTIONS_TYPE_ESPACE = [
  { code: "balcon", libelle: "Balcon" },
  { code: "terrasse", libelle: "Terrasse" },
  { code: "toit_terrasse", libelle: "Toit-terrasse" },
];

const OPTIONS_COPRO = [
  { code: "obtenu", libelle: "Obtenu" },
  { code: "a_demander", libelle: "À demander" },
  { code: "non_necessaire", libelle: "Non nécessaire" },
  { code: "ne_sait_pas", libelle: "Je ne sais pas" },
];

export function EtapeProjet({ typeLieu, donnees, onValider, onRetour }: Props) {
  const [typesAmenagement, setTypesAmenagement] = useState<string[]>(
    donnees.typesAmenagement ?? [],
  );
  const [tranche, setTranche] = useState(donnees.trancheSurface ?? "");
  const [description, setDescription] = useState(donnees.description ?? "");

  // Champs appartement
  const [typeEspace, setTypeEspace] = useState(donnees.typeEspace ?? "");
  const [etage, setEtage] = useState(donnees.etage?.toString() ?? "");
  const [acces, setAcces] = useState(donnees.acces ?? "");
  const [orientation, setOrientation] = useState(donnees.orientationEspace ?? "");
  const [copro, setCopro] = useState(donnees.accordCopro ?? "");

  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  const amenagements = amenagementsPourLieu(typeLieu);
  const tranches = tranchesPourLieu(typeLieu);

  const toggleAmenagement = (code: string) => {
    setTypesAmenagement((prev) => {
      if (code === "creation_complete") {
        return prev.includes(code) ? [] : [code];
      }
      const sans = prev.filter((c) => c !== "creation_complete");
      return sans.includes(code)
        ? sans.filter((c) => c !== code)
        : [...sans, code];
    });
  };

  const soumettre = async () => {
    setErreurs({});

    const base = {
      types_amenagement: typesAmenagement,
      tranche_surface: tranche,
      description,
    };

    const schema =
      typeLieu === "maison" ? schemaProjetMaison : schemaProjetAppartement;

    const donneesParsed =
      typeLieu === "maison"
        ? base
        : {
            ...base,
            type_espace: typeEspace,
            etage: etage === "" ? undefined : parseInt(etage, 10),
            acces,
            orientation_espace: orientation,
            accord_copro: copro,
          };

    const result = schema.safeParse(donneesParsed);
    if (!result.success) {
      const champs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const clef = String(issue.path[0] ?? "_global");
        if (!champs[clef]) champs[clef] = issue.message;
      }
      setErreurs(champs);
      return;
    }

    setEnCours(true);
    try {
      const mediane = medianeParCode(typeLieu, tranche);

      const patchData: Record<string, unknown> = {
        types_amenagement: typesAmenagement,
        tranche_surface: tranche,
        surface_projet: mediane,
        description,
        etape_atteinte: 5,
      };

      if (typeLieu === "appartement") {
        patchData.type_espace = typeEspace;
        patchData.etage = parseInt(etage, 10);
        patchData.acces = acces;
        patchData.orientation_espace = orientation;
        patchData.accord_copro = copro;
      }

      const res = await fetch("/api/leads/courant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchData),
      });

      if (!res.ok) {
        setErreurs({ _global: "Erreur lors de l'enregistrement." });
        return;
      }

      const maj: Partial<DonneesEstimation> = {
        typesAmenagement,
        trancheSurface: tranche,
        description,
      };

      if (typeLieu === "appartement") {
        maj.typeEspace = typeEspace as DonneesEstimation["typeEspace"];
        maj.etage = parseInt(etage, 10);
        maj.acces = acces as DonneesEstimation["acces"];
        maj.orientationEspace = orientation as DonneesEstimation["orientationEspace"];
        maj.accordCopro = copro as DonneesEstimation["accordCopro"];
      }

      onValider(maj);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Votre projet
      </h1>

      {/* Types d'aménagement */}
      <p className="mt-6 text-[0.88rem] font-medium text-ink">
        Quels aménagements souhaitez-vous ?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {amenagements.map((a) => {
          const actif = typesAmenagement.includes(a.code);
          return (
            <button
              key={a.code}
              onClick={() => toggleAmenagement(a.code)}
              className={`px-4 py-2.5 rounded-full text-[0.85rem] border transition-colors ${
                actif
                  ? "bg-brass text-paper border-brass"
                  : "bg-white text-ink border-hair-light hover:border-brass"
              }`}
            >
              {a.libelle}
            </button>
          );
        })}
      </div>
      {erreurs.types_amenagement && (
        <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.types_amenagement}</p>
      )}

      {/* Surface */}
      <p className="mt-8 text-[0.88rem] font-medium text-ink">
        Surface concernée
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tranches.map((t) => (
          <button
            key={t.code}
            onClick={() => setTranche(t.code)}
            className={`px-4 py-2.5 rounded-full text-[0.85rem] border transition-colors ${
              tranche === t.code
                ? "bg-brass text-paper border-brass"
                : "bg-white text-ink border-hair-light hover:border-brass"
            }`}
          >
            {t.libelle}
          </button>
        ))}
      </div>
      {erreurs.tranche_surface && (
        <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.tranche_surface}</p>
      )}

      {/* Champs appartement */}
      {typeLieu === "appartement" && (
        <div className="mt-8 space-y-5 max-w-md">
          <div>
            <label className="block text-[0.88rem] font-medium text-ink mb-1">
              Type d'espace
            </label>
            <div className="flex flex-wrap gap-2">
              {OPTIONS_TYPE_ESPACE.map((o) => (
                <button
                  key={o.code}
                  onClick={() => setTypeEspace(o.code)}
                  className={`px-4 py-2 rounded-full text-[0.85rem] border transition-colors ${
                    typeEspace === o.code
                      ? "bg-brass text-paper border-brass"
                      : "bg-white text-ink border-hair-light hover:border-brass"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>
            {erreurs.type_espace && (
              <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.type_espace}</p>
            )}
          </div>

          <div>
            <label htmlFor="etage" className="block text-[0.88rem] font-medium text-ink mb-1">
              Étage (0 = rez-de-chaussée)
            </label>
            <input
              id="etage"
              type="text"
              inputMode="numeric"
              value={etage}
              onChange={(e) => setEtage(e.target.value.replace(/\D/g, ""))}
              className="w-24 px-4 py-3 border border-hair-light rounded bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
            />
            {erreurs.etage && (
              <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.etage}</p>
            )}
          </div>

          <div>
            <label className="block text-[0.88rem] font-medium text-ink mb-1">
              Accès pour le matériel
            </label>
            <div className="flex flex-wrap gap-2">
              {OPTIONS_ACCES.map((o) => (
                <button
                  key={o.code}
                  onClick={() => setAcces(o.code)}
                  className={`px-4 py-2 rounded-full text-[0.85rem] border transition-colors ${
                    acces === o.code
                      ? "bg-brass text-paper border-brass"
                      : "bg-white text-ink border-hair-light hover:border-brass"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>
            {erreurs.acces && (
              <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.acces}</p>
            )}
          </div>

          <div>
            <label className="block text-[0.88rem] font-medium text-ink mb-1">
              Orientation principale
            </label>
            <div className="flex flex-wrap gap-2">
              {OPTIONS_ORIENTATION.map((o) => (
                <button
                  key={o.code}
                  onClick={() => setOrientation(o.code)}
                  className={`px-3 py-2 rounded-full text-[0.82rem] border transition-colors ${
                    orientation === o.code
                      ? "bg-brass text-paper border-brass"
                      : "bg-white text-ink border-hair-light hover:border-brass"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>
            {erreurs.orientation_espace && (
              <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.orientation_espace}</p>
            )}
          </div>

          <div>
            <label className="block text-[0.88rem] font-medium text-ink mb-1">
              Accord de la copropriété
            </label>
            <div className="flex flex-wrap gap-2">
              {OPTIONS_COPRO.map((o) => (
                <button
                  key={o.code}
                  onClick={() => setCopro(o.code)}
                  className={`px-4 py-2 rounded-full text-[0.85rem] border transition-colors ${
                    copro === o.code
                      ? "bg-brass text-paper border-brass"
                      : "bg-white text-ink border-hair-light hover:border-brass"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>
            {erreurs.accord_copro && (
              <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.accord_copro}</p>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="mt-8 max-w-xl">
        <label htmlFor="description" className="block text-[0.88rem] font-medium text-ink mb-1">
          Décrivez votre projet
        </label>
        <p className="text-[0.78rem] text-stone mb-2">
          Ce que vous aimez, ce qui vous gêne, vos envies, l'usage du jardin
          (enfants, animaux, potager, réceptions…).
        </p>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink resize-y focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
        />
        <div className="flex justify-between mt-1">
          <p className="text-[0.75rem] text-stone">
            {description.length} caractère{description.length > 1 ? "s" : ""}
            {description.length >= 100 && (
              <span className="text-green-600 ml-2">Très bien, continuez !</span>
            )}
          </p>
          {description.length > 0 && description.length < 30 && (
            <p className="text-[0.75rem] text-stone">
              Minimum 30 caractères
            </p>
          )}
        </div>
        {erreurs.description && (
          <p className="mt-1 text-[0.82rem] text-red-700">{erreurs.description}</p>
        )}
      </div>

      {erreurs._global && (
        <p className="mt-4 text-[0.88rem] text-red-700">{erreurs._global}</p>
      )}

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
          {enCours ? "Enregistrement…" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
