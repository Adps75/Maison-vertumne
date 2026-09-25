"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DonneesEstimation, ParcelleInfo, TypeLieu } from "@/lib/types/estimation";
import { estDansZone } from "@/lib/geo";
import { ZONE } from "@/config/zone";
import { CarteParcelle } from "./CarteParcelle";

interface Suggestion {
  label: string;
  lat: number;
  lon: number;
  citycode: string;
}

interface Props {
  typeLieu: TypeLieu;
  donnees: DonneesEstimation;
  onValider: (maj: Partial<DonneesEstimation>) => void;
  onRetour: () => void;
}

const estMaison = (t: TypeLieu) => t === "maison";

export function EtapeAdresse({ typeLieu, donnees, onValider, onRetour }: Props) {
  const [query, setQuery] = useState(donnees.adresseLabel ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [indexActif, setIndexActif] = useState(-1);
  const [ouvert, setOuvert] = useState(false);
  const [horsZone, setHorsZone] = useState(false);
  const [adresseSelectionnee, setAdresseSelectionnee] = useState<Suggestion | null>(
    donnees.lat != null
      ? {
          label: donnees.adresseLabel ?? "",
          lat: donnees.lat,
          lon: donnees.lon!,
          citycode: donnees.codeInsee ?? "",
        }
      : null,
  );
  const [parcelle, setParcelle] = useState<ParcelleInfo | null>(
    donnees.parcelle ?? null,
  );
  const [chargementParcelle, setChargementParcelle] = useState(false);
  const [erreurParcelle, setErreurParcelle] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);

  // Autocomplétion avec debounce
  const chercher = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5&index=address`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const items: Suggestion[] = (data.features ?? []).map(
          (f: { properties: { label: string; citycode: string }; geometry: { coordinates: [number, number] } }) => ({
            label: f.properties.label,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            citycode: f.properties.citycode,
          }),
        );
        setSuggestions(items);
        setOuvert(items.length > 0);
        setIndexActif(-1);
      } catch {
        // Silencieux
      }
    }, 300);
  }, []);

  // Recherche de parcelle (maison uniquement)
  const chercherParcelle = useCallback(async (lat: number, lon: number) => {
    setChargementParcelle(true);
    setErreurParcelle(null);
    setParcelle(null);
    try {
      const res = await fetch(`/api/parcelle?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setErreurParcelle(data.error ?? "Parcelle introuvable.");
        return;
      }
      setParcelle(data as ParcelleInfo);
    } catch {
      setErreurParcelle("Impossible de contacter le service cadastral.");
    } finally {
      setChargementParcelle(false);
    }
  }, []);

  // Sélection d'une adresse
  const selectionner = useCallback(
    (s: Suggestion) => {
      setQuery(s.label);
      setSuggestions([]);
      setOuvert(false);

      if (!estDansZone(s.lat, s.lon)) {
        setHorsZone(true);
        setAdresseSelectionnee(null);
        setParcelle(null);
        return;
      }

      setHorsZone(false);
      setAdresseSelectionnee(s);

      if (estMaison(typeLieu)) {
        chercherParcelle(s.lat, s.lon);
      }
    },
    [typeLieu, chercherParcelle],
  );

  // Clic sur la carte pour relancer la recherche de parcelle (maison uniquement)
  const onClicCarte = useCallback(
    (lat: number, lon: number) => {
      if (adresseSelectionnee && estMaison(typeLieu)) {
        chercherParcelle(lat, lon);
      }
    },
    [typeLieu, adresseSelectionnee, chercherParcelle],
  );

  // Navigation clavier
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!ouvert) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndexActif((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndexActif((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (indexActif >= 0 && suggestions[indexActif]) {
          selectionner(suggestions[indexActif]);
        }
        break;
      case "Escape":
        setOuvert(false);
        break;
    }
  };

  // Scroll vers l'élément actif
  useEffect(() => {
    if (indexActif >= 0 && listeRef.current) {
      const el = listeRef.current.children[indexActif] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [indexActif]);

  // Maison : parcelle requise. Appartement : adresse suffit.
  const peutContinuer = estMaison(typeLieu)
    ? parcelle !== null
    : adresseSelectionnee !== null && !horsZone;

  const titre = estMaison(typeLieu)
    ? "Où se trouve votre jardin ?"
    : "Où se trouve votre appartement ?";

  const sousTitre = estMaison(typeLieu)
    ? "Saisissez votre adresse pour localiser votre terrain."
    : "Saisissez votre adresse pour vérifier que vous êtes dans notre zone.";

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        {titre}
      </h1>
      <p className="mt-2 text-stone text-[0.95rem]">{sousTitre}</p>

      {/* Champ d'adresse avec autocomplétion */}
      <div className="relative mt-6 max-w-xl">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHorsZone(false);
            setAdresseSelectionnee(null);
            setParcelle(null);
            chercher(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder="12 rue des Jardins, Le Plessis-Robinson"
          suppressHydrationWarning
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls="suggestions-adresse"
          aria-autocomplete="list"
          aria-activedescendant={
            indexActif >= 0 ? `suggestion-${indexActif}` : undefined
          }
          className="w-full px-4 py-3 border border-hair-light rounded bg-white text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
        />

        {ouvert && suggestions.length > 0 && (
          <ul
            ref={listeRef}
            id="suggestions-adresse"
            role="listbox"
            className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-hair-light rounded shadow-lg max-h-60 overflow-y-auto"
          >
            {suggestions.map((s, i) => (
              <li
                key={i}
                id={`suggestion-${i}`}
                role="option"
                aria-selected={i === indexActif}
                onClick={() => selectionner(s)}
                onMouseEnter={() => setIndexActif(i)}
                className={`px-4 py-3 cursor-pointer text-[0.92rem] ${
                  i === indexActif ? "bg-paper-2" : ""
                }`}
              >
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Message hors zone */}
      {horsZone && (
        <div className="mt-4 p-4 bg-paper-2 border border-hair-light rounded max-w-xl">
          <p className="text-[0.92rem] text-ink">{ZONE.messageHorsZone}</p>
        </div>
      )}

      {/* Chargement parcelle (maison) */}
      {estMaison(typeLieu) && chargementParcelle && (
        <p className="mt-6 text-stone text-[0.9rem]">
          Recherche de votre parcelle cadastrale…
        </p>
      )}

      {/* Erreur parcelle (maison) */}
      {estMaison(typeLieu) && erreurParcelle && !chargementParcelle && (
        <div className="mt-4 p-4 bg-paper-2 border border-hair-light rounded max-w-xl">
          <p className="text-[0.92rem] text-ink">{erreurParcelle}</p>
          {adresseSelectionnee && (
            <p className="mt-2 text-[0.82rem] text-stone">
              Cliquez sur votre terrain dans la carte ci-dessous pour relancer la
              recherche.
            </p>
          )}
        </div>
      )}

      {/* Carte */}
      {adresseSelectionnee && !horsZone && (
        <div className="mt-6">
          <CarteParcelle
            mode={typeLieu}
            centre={{ lat: adresseSelectionnee.lat, lon: adresseSelectionnee.lon }}
            parcelle={estMaison(typeLieu) ? parcelle : null}
            onClicCarte={onClicCarte}
          />

          {estMaison(typeLieu) && parcelle && (
            <div className="mt-3 flex items-center gap-4">
              <p className="text-[0.9rem] text-ink">
                Surface de la parcelle :{" "}
                <span className="font-medium">
                  {parcelle.contenance.toLocaleString("fr-FR")} m²
                </span>
              </p>
              <span className="text-[0.78rem] text-stone">
                {parcelle.commune} — section {parcelle.section}, n°{parcelle.numero}
              </span>
            </div>
          )}
        </div>
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
          disabled={!peutContinuer}
          onClick={() => {
            if (!adresseSelectionnee) return;
            onValider({
              adresseLabel: adresseSelectionnee.label,
              lat: adresseSelectionnee.lat,
              lon: adresseSelectionnee.lon,
              codeInsee: adresseSelectionnee.citycode,
              ...(estMaison(typeLieu) && parcelle
                ? { parcelle, surfaceParcelle: parcelle.contenance }
                : {}),
            });
          }}
          className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
