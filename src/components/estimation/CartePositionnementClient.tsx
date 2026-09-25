"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PhotoEstimation, ParcelleInfo } from "@/lib/types/estimation";

interface Props {
  centre: { lat: number; lon: number };
  parcelle: ParcelleInfo;
  photos: PhotoEstimation[];
  onClicCarte: (lat: number, lon: number) => void;
}

const ORTHO_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
const CADASTRE_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image%2Fpng&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

const LAITON = "#9C7C3C";
const MAX_NATIVE_ZOOM = 19;
const MAX_ZOOM = 22;

function marqueurNumero(n: number) {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${LAITON};color:#F2F0E9;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">${n}</div>`,
  });
}

export function CartePositionnementClient({
  centre,
  parcelle,
  photos,
  onClicCarte,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Init carte
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centre.lat, centre.lon],
      zoom: 18,
      maxZoom: MAX_ZOOM,
    });

    L.tileLayer(ORTHO_URL, {
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
      attribution: "&copy; IGN — Géoplateforme",
    }).addTo(map);

    L.tileLayer(CADASTRE_URL, {
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
      opacity: 0.6,
    }).addTo(map);

    // Parcelle
    const halo = L.geoJSON(parcelle.geometry as GeoJSON.GeoJsonObject, {
      style: { color: "#F2F0E9", weight: 6, fillColor: LAITON, fillOpacity: 0.15 },
    }).addTo(map);
    L.geoJSON(parcelle.geometry as GeoJSON.GeoJsonObject, {
      style: { color: LAITON, weight: 2.5, dashArray: "8 5", fillOpacity: 0 },
    }).addTo(map);

    map.fitBounds(halo.getBounds().pad(0.15), { maxZoom: MAX_NATIVE_ZOOM });

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clic handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => onClicCarte(e.latlng.lat, e.latlng.lng);
    map.off("click");
    map.on("click", handler);
  }, [onClicCarte]);

  // Marqueurs + cônes de vision
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    for (const photo of photos) {
      if (photo.lat == null || photo.lon == null) continue;

      // Marqueur numéroté
      L.marker([photo.lat, photo.lon], {
        icon: marqueurNumero(photo.ordre),
        interactive: false,
      }).addTo(group);

      // Cône de vision
      if (photo.orientation_degres != null) {
        const dir = photo.orientation_degres;
        const len = 0.0003; // ~30m en degrés
        const spread = 20; // demi-angle du cône

        const toRad = (d: number) => (d * Math.PI) / 180;
        const p1Lat = photo.lat + len * Math.cos(toRad(dir - spread));
        const p1Lon = photo.lon + len * Math.sin(toRad(dir - spread));
        const p2Lat = photo.lat + len * Math.cos(toRad(dir + spread));
        const p2Lon = photo.lon + len * Math.sin(toRad(dir + spread));

        L.polygon(
          [
            [photo.lat, photo.lon],
            [p1Lat, p1Lon],
            [p2Lat, p2Lon],
          ],
          {
            color: LAITON,
            weight: 1.5,
            fillColor: LAITON,
            fillOpacity: 0.25,
            interactive: false,
          },
        ).addTo(group);
      }
    }
  }, [photos]);

  return (
    <div className="rounded overflow-hidden border border-hair-light">
      <div ref={containerRef} className="h-[400px] sm:h-[500px]" />
    </div>
  );
}
