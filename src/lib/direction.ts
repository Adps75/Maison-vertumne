interface Point {
  lat: number;
  lon: number;
}

/**
 * Calcule la direction (bearing) en degrés depuis un point de départ
 * vers un point cible. 0 = nord, 90 = est, 180 = sud, 270 = ouest.
 */
export function calculerDirection(depart: Point, cible: Point): number {
  const dLon = toRad(cible.lon - depart.lon);
  const lat1 = toRad(depart.lat);
  const lat2 = toRad(cible.lat);

  const x = Math.sin(dLon) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = (toDeg(Math.atan2(x, y)) + 360) % 360;
  return Math.round(bearing * 100) / 100;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
