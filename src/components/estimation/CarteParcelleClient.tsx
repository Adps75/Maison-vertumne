"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ParcelleInfo, TypeLieu } from "@/lib/types/estimation";

interface Props {
  mode: TypeLieu;
  centre: { lat: number; lon: number };
  parcelle: ParcelleInfo | null;
  onClicCarte: (lat: number, lon: number) => void;
}

const ORTHO_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

const CADASTRE_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image%2Fpng&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

const LAITON = "#9C7C3C";
const MAX_NATIVE_ZOOM = 19;
const MAX_ZOOM = 22;

// Icône marqueur laiton (SVG inline) pour le mode appartement
function creerMarqueurLaiton() {
  return L.divIcon({
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="${LAITON}"/>
      <circle cx="14" cy="14" r="6" fill="#F2F0E9"/>
    </svg>`,
  });
}

export function CarteParcelleClient({ mode, centre, parcelle, onClicCarte }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const parcelleLayerRef = useRef<L.LayerGroup | null>(null);
  const marqueurRef = useRef<L.Marker | null>(null);
  const cadastreLayerRef = useRef<L.TileLayer | null>(null);

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const zoomInitial = mode === "appartement" ? 17 : 18;

    const map = L.map(containerRef.current, {
      center: [centre.lat, centre.lon],
      zoom: zoomInitial,
      maxZoom: MAX_ZOOM,
      zoomControl: true,
    });

    L.tileLayer(ORTHO_URL, {
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
      attribution: "&copy; IGN — Géoplateforme",
    }).addTo(map);

    // Calque cadastral uniquement en mode maison
    if (mode === "maison") {
      const cadastre = L.tileLayer(CADASTRE_URL, {
        maxNativeZoom: MAX_NATIVE_ZOOM,
        maxZoom: MAX_ZOOM,
        opacity: 0.6,
      }).addTo(map);
      cadastreLayerRef.current = cadastre;
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      onClicCarte(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      cadastreLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mise à jour du centre
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const zoom = mode === "appartement" ? 17 : 18;
    map.setView([centre.lat, centre.lon], zoom);

    // Marqueur laiton en mode appartement
    if (mode === "appartement") {
      if (marqueurRef.current) {
        marqueurRef.current.setLatLng([centre.lat, centre.lon]);
      } else {
        marqueurRef.current = L.marker([centre.lat, centre.lon], {
          icon: creerMarqueurLaiton(),
        }).addTo(map);
      }
    } else if (marqueurRef.current) {
      map.removeLayer(marqueurRef.current);
      marqueurRef.current = null;
    }
  }, [centre.lat, centre.lon, mode]);

  // Mise à jour du handler de clic (éviter closure stale)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      onClicCarte(e.latlng.lat, e.latlng.lng);
    };

    map.off("click");
    map.on("click", handler);
  }, [onClicCarte]);

  // Affichage de la parcelle (maison uniquement)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (parcelleLayerRef.current) {
      map.removeLayer(parcelleLayerRef.current);
      parcelleLayerRef.current = null;
    }

    if (!parcelle || mode === "appartement") return;

    // Halo lumineux
    const halo = L.geoJSON(parcelle.geometry as GeoJSON.GeoJsonObject, {
      style: {
        color: "#F2F0E9",
        weight: 6,
        fillColor: LAITON,
        fillOpacity: 0.15,
        dashArray: "",
      },
    }).addTo(map);

    // Contour laiton en pointillés
    const contour = L.geoJSON(parcelle.geometry as GeoJSON.GeoJsonObject, {
      style: {
        color: LAITON,
        weight: 2.5,
        dashArray: "8 5",
        fillOpacity: 0,
      },
    }).addTo(map);

    const layer = L.layerGroup([halo, contour]).addTo(map);
    parcelleLayerRef.current = layer;

    map.fitBounds(contour.getBounds().pad(0.15), {
      maxZoom: MAX_NATIVE_ZOOM,
    });

    setTimeout(() => map.invalidateSize(), 100);
  }, [parcelle, mode]);

  return (
    <div className="rounded overflow-hidden border border-hair-light">
      <div ref={containerRef} className="h-[400px] sm:h-[500px]" />
      {mode === "maison" && !parcelle && (
        <p className="px-4 py-2 bg-paper-2 text-[0.82rem] text-stone text-center">
          Cliquez sur votre terrain si la parcelle affichée n&apos;est pas la bonne.
        </p>
      )}
    </div>
  );
}
