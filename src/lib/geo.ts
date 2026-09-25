import { ZONE } from "@/config/zone";

interface Point {
  lat: number;
  lon: number;
}

const R_TERRE_KM = 6371;

/** Distance en km entre deux points (formule de Haversine). */
export function haversine(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;

  return 2 * R_TERRE_KM * Math.asin(Math.sqrt(h));
}

/** Vérifie qu'un point est dans la zone d'intervention. */
export function estDansZone(lat: number, lon: number): boolean {
  return haversine(ZONE.centre, { lat, lon }) <= ZONE.rayonKm;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
