"use client";

/**
 * Matériaux du projet dans la scène 3D (Visuel) : surfaces posées sur le relief, avec la
 * texture répétable du matériau à l'échelle réelle et découpées exactement selon leur
 * contour ; linéaires (volige, bordure) en bandes à leur largeur et leur hauteur. Ils
 * reçoivent les ombres, sont cachés par le terrain, les bâtiments et l'existant, et font
 * partie de la couche envoyée au rendu IA. userData.materiauId sert à la carte des
 * matériaux.
 */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { DonneesScene3D, LineaireMateriau3D, SurfaceMateriau3D } from "../types";
import { geometrieMassif } from "../capture-rendu";
import { DECALAGE_SURFACE, geometrieBande, uvMonde } from "../materiaux3d";

const textures = new Map<string, THREE.Texture>();
/** Les matériaux n'interceptent pas les clics (pose des plantes sur le terrain). */
const pasDeRaycast = () => null;

function useTexture(url: string | null): THREE.Texture | null {
  const [t, setT] = useState<THREE.Texture | null>(url ? textures.get(url) ?? null : null);
  useEffect(() => {
    if (!url || textures.has(url)) return;
    let actif = true;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      textures.set(url, tex);
      if (actif) setT(tex);
    });
    return () => { actif = false; };
  }, [url]);
  return url ? t ?? textures.get(url) ?? null : null;
}

function Surface({ s, altitudeEn }: { s: SurfaceMateriau3D; altitudeEn: (x: number, y: number) => number }) {
  const texture = useTexture(s.textureUrl);
  const geometrie = useMemo(() => {
    // Même maillage drapé que le massif du rendu, abaissé au décalage des matériaux
    const geo = geometrieMassif([s.points], (x, y) => altitudeEn(x, y) - 0.03 + DECALAGE_SURFACE);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvMonde(geo.getAttribute("position").array, s.tailleTexture), 2));
    geo.computeVertexNormals();
    return geo;
  }, [s.points, s.tailleTexture, altitudeEn]);
  useEffect(() => () => geometrie.dispose(), [geometrie]);
  return (
    <mesh geometry={geometrie} receiveShadow raycast={pasDeRaycast} userData={{ materiauId: s.materiauId, materiau3D: true }}>
      <meshStandardMaterial key={texture ? "t" : "c"} map={texture} color={texture ? "#ffffff" : s.couleur} roughness={0.95} metalness={0}
        side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

function Lineaire({ l, altitudeEn }: { l: LineaireMateriau3D; altitudeEn: (x: number, y: number) => number }) {
  const geometrie = useMemo(() => {
    const { positions, indices } = geometrieBande(l.points, l.largeur, l.hauteur, altitudeEn);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [l.points, l.largeur, l.hauteur, altitudeEn]);
  useEffect(() => () => geometrie.dispose(), [geometrie]);
  return (
    <mesh geometry={geometrie} castShadow receiveShadow raycast={pasDeRaycast} userData={{ materiauId: l.materiauId, materiau3D: true }}>
      <meshStandardMaterial color={l.couleur} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Materiaux3D({ materiaux, altitudeEn, visible = true }: {
  materiaux: DonneesScene3D["materiaux3D"];
  altitudeEn: (x: number, y: number) => number;
  visible?: boolean;
}) {
  return (
    <group visible={visible} userData={{ groupeMateriaux: true }}>
      {materiaux.surfaces.map((s) => <Surface key={s.id} s={s} altitudeEn={altitudeEn} />)}
      {materiaux.lineaires.map((l) => <Lineaire key={l.id} l={l} altitudeEn={altitudeEn} />)}
    </group>
  );
}
