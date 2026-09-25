"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  DonneesEstimation,
  PhotoEstimation,
  TypeLieu,
} from "@/lib/types/estimation";
import { redimensionnerImage } from "@/lib/photos-client";
import { genererIdLocal } from "@/lib/id-client";
import { MIN_PHOTOS, MAX_PHOTOS } from "@/lib/validation/photos";
import { PhotoPositionnement } from "./PhotoPositionnement";
import { PhotoLegende } from "./PhotoLegende";

interface Props {
  typeLieu: TypeLieu;
  donnees: DonneesEstimation;
  onValider: (maj: Partial<DonneesEstimation>) => void;
  onRetour: () => void;
}

interface PhotoLocale extends PhotoEstimation {
  blobUrl?: string;
  envoi?: "en-cours" | "ok" | "erreur";
  progression?: number;
}

export function EtapePhotos({ typeLieu, donnees, onValider, onRetour }: Props) {
  const [photos, setPhotos] = useState<PhotoLocale[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger les photos existantes au montage
  useEffect(() => {
    if (!donnees.leadId) {
      setChargement(false);
      return;
    }
    fetch("/api/leads/courant/photos")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.photos) {
          setPhotos(
            data.photos.map((p: PhotoEstimation) => ({
              ...p,
              envoi: "ok" as const,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, [donnees.leadId]);

  // Envoyer une photo
  const envoyerPhoto = useCallback(
    async (file: File) => {
      setErreur(null);

      // Redimensionner
      let blob: Blob;
      try {
        blob = await redimensionnerImage(file);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur de traitement de l'image.");
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const ordre = photos.length + 1;

      // Photo temporaire dans l'état
      const tempId = genererIdLocal();
      const photoTemp: PhotoLocale = {
        id: tempId,
        path: "",
        ordre,
        blobUrl,
        envoi: "en-cours",
        progression: 0,
      };
      setPhotos((prev) => [...prev, photoTemp]);

      try {
        // 1. Obtenir l'URL signée
        const urlRes = await fetch("/api/leads/courant/photos/url", {
          method: "POST",
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok || !urlData.ok) {
          throw new Error(urlData.error ?? "Impossible d'obtenir l'URL d'envoi.");
        }

        const { signedUrl, path } = urlData;

        // 2. Upload via XHR pour la progression
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setPhotos((prev) =>
                prev.map((p) =>
                  p.id === tempId ? { ...p, progression: pct } : p,
                ),
              );
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload échoué (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("Erreur réseau lors de l'envoi."));
          xhr.open("PUT", signedUrl);
          xhr.setRequestHeader("Content-Type", "image/jpeg");
          xhr.send(blob);
        });

        // 3. Enregistrer en base
        const regRes = await fetch("/api/leads/courant/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, ordre }),
        });
        const regData = await regRes.json();
        if (!regRes.ok || !regData.ok) {
          throw new Error(regData.error ?? "Impossible d'enregistrer la photo.");
        }

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? { ...p, id: regData.id, path, envoi: "ok" as const, progression: 100 }
              : p,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur d'envoi.";
        setErreur(msg);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempId ? { ...p, envoi: "erreur" as const } : p,
          ),
        );
      }
    },
    [photos.length],
  );

  // Supprimer une photo
  const supprimerPhoto = useCallback(async (photoId: string) => {
    await fetch(`/api/leads/courant/photos?id=${photoId}`, { method: "DELETE" });
    setPhotos((prev) => {
      const restantes = prev.filter((p) => p.id !== photoId);
      // Renumeroter
      return restantes.map((p, i) => ({ ...p, ordre: i + 1 }));
    });
  }, []);

  // Retenter l'envoi
  const retirerErreur = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }, []);

  // Mise à jour position/légende d'une photo
  const majPhoto = useCallback(
    async (photoId: string, maj: Partial<PhotoEstimation>) => {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, ...maj } : p)),
      );
      // Sauvegarder côté serveur
      await fetch(`/api/leads/courant/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(maj),
      });
    },
    [],
  );

  const onFichiers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichiers = e.target.files;
    if (!fichiers) return;
    const restantes = MAX_PHOTOS - photos.length;
    for (let i = 0; i < Math.min(fichiers.length, restantes); i++) {
      envoyerPhoto(fichiers[i]);
    }
    e.target.value = "";
  };

  const photosOk = photos.filter((p) => p.envoi === "ok");
  const toutesPositionnees =
    typeLieu === "appartement"
      ? photosOk.every((p) => p.legende && p.legende.trim().length > 0)
      : photosOk.every(
          (p) => p.lat != null && p.lon != null && p.orientation_degres != null,
        );

  const peutContinuer =
    photosOk.length >= MIN_PHOTOS && toutesPositionnees;

  const valider = async () => {
    // Mettre à jour etape_atteinte
    await fetch("/api/leads/courant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etape_atteinte: 4 }),
    });
    onValider({ photos: photosOk });
  };

  if (chargement) {
    return <p className="text-stone py-10">Chargement…</p>;
  }

  return (
    <div>
      <h1 className="font-serif font-medium text-[clamp(1.8rem,4vw,2.6rem)] text-green-950">
        Photos de votre extérieur
      </h1>
      <p className="mt-2 text-stone text-[0.95rem]">
        Prenez votre jardin sous plusieurs angles, en incluant les zones à
        aménager. {MIN_PHOTOS} photos minimum, {MAX_PHOTOS} maximum.
      </p>

      {/* Grille de miniatures */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square rounded overflow-hidden border border-hair-light bg-paper-2"
          >
            {/* Miniature */}
            {(photo.blobUrl || photo.url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.blobUrl ?? photo.url}
                alt={`Photo ${photo.ordre}`}
                className="w-full h-full object-cover"
              />
            )}

            {/* Numéro */}
            <span className="absolute top-1.5 left-1.5 bg-brass text-paper text-[0.7rem] font-medium w-5 h-5 flex items-center justify-center rounded-full">
              {photo.ordre}
            </span>

            {/* Progression */}
            {photo.envoi === "en-cours" && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-paper text-sm font-medium">
                  {photo.progression ?? 0}%
                </span>
              </div>
            )}

            {/* Erreur */}
            {photo.envoi === "erreur" && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 p-2">
                <span className="text-paper text-[0.75rem] text-center">Échec</span>
                <button
                  onClick={() => retirerErreur(photo.id)}
                  className="text-[0.7rem] text-brass underline"
                >
                  Retirer
                </button>
              </div>
            )}

            {/* Supprimer */}
            {photo.envoi === "ok" && (
              <button
                onClick={() => supprimerPhoto(photo.id)}
                className="absolute top-1.5 right-1.5 bg-black/60 text-paper w-5 h-5 flex items-center justify-center rounded-full text-[0.7rem] hover:bg-black/80"
                aria-label={`Supprimer photo ${photo.ordre}`}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* Bouton ajouter */}
        {photos.length < MAX_PHOTOS && (
          <button
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded border-2 border-dashed border-hair-light flex flex-col items-center justify-center gap-1 text-stone hover:border-brass hover:text-brass transition-colors"
          >
            <span className="text-2xl">+</span>
            <span className="text-[0.72rem]">Ajouter</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFichiers}
        className="hidden"
      />

      {erreur && (
        <p className="mt-3 text-[0.88rem] text-red-700">{erreur}</p>
      )}

      {/* Positionnement (maison) ou légendes (appartement) */}
      {photosOk.length > 0 && typeLieu === "maison" && donnees.parcelle && (
        <div className="mt-8">
          <h2 className="font-serif font-medium text-[1.3rem] text-green-950 mb-3">
            Positionnez vos photos sur la carte
          </h2>
          <p className="text-stone text-[0.88rem] mb-4">
            Pour chaque photo : touchez l'endroit où vous étiez, puis ce que
            vous photographiez.
          </p>
          <PhotoPositionnement
            photos={photosOk}
            parcelle={donnees.parcelle}
            centre={{ lat: donnees.lat!, lon: donnees.lon! }}
            onMajPhoto={majPhoto}
          />
        </div>
      )}

      {photosOk.length > 0 && typeLieu === "appartement" && (
        <div className="mt-8">
          <h2 className="font-serif font-medium text-[1.3rem] text-green-950 mb-3">
            Décrivez chaque photo
          </h2>
          <PhotoLegende photos={photosOk} onMajPhoto={majPhoto} />
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
          onClick={valider}
          className="px-8 py-3 bg-brass text-paper font-medium rounded hover:bg-brass-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
