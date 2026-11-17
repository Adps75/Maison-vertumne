/**
 * Capture des couches nécessaires au rendu IA, depuis la scène 3D du Visuel,
 * à la résolution de la photo et avec la caméra calée.
 *
 * 1. Couche 3D : la scène telle qu'affichée (végétaux + ombres portées au sol),
 *    fond transparent. Les traits de construction sont dans une autre scène :
 *    ils n'y figurent jamais. L'anneau de sélection et l'aperçu de pose sont masqués.
 * 2. Masque de scène : silhouettes des végétaux, matériaux et massif posé au sol en
 *    blanc, terrain et bâtiments en occultants noirs (la maison et le ciel restent à 0).
 * 3. Carte des matériaux : chaque matériau en couleur franche (couleursCarte), tout le
 *    reste en noir ; végétaux, terrain, bâtiments et existant occultent.
 * Les matériaux sont toujours capturés, même masqués à l'écran.
 */

import * as THREE from "three";
import type { Pt } from "../geo/plan";
import { planVers3D } from "./conversion";
import { depremultiplier, retournerVerticalement } from "../rendu/image";

export interface CouchesCapturees {
  largeur: number;
  hauteur: number;
  /** RGBA, alpha non prémultiplié. */
  couche: Uint8ClampedArray;
  /** RGBA, blanc = végétaux et massif, noir ailleurs. */
  masqueScene: Uint8ClampedArray;
  /** RGBA, couleur de carte de chaque matériau, noir ailleurs. */
  carte: Uint8ClampedArray;
  /** RGBA, blanc = emprise de l'existant (volumes et disques au sol), noir ailleurs. */
  existant: Uint8ClampedArray;
}

export type CaptureurRendu = (largeur: number, hauteur: number) => CouchesCapturees;

/** Hauteur du massif au-dessus du terrain pour le masque, en mètres. */
const DECALAGE_MASSIF = 0.03;
/** Longueur maximale d'arête des triangles du massif (suivi du relief), en mètres. */
const ARETE_MAX = 0.5;

/** Subdivise un triangle jusqu'à ce que ses arêtes soient ≤ aretMax. */
function subdiviser(a: Pt, b: Pt, c: Pt, areteMax: number, sortie: Pt[], profondeur = 0) {
  const d = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (profondeur >= 10 || Math.max(d(a, b), d(b, c), d(c, a)) <= areteMax) {
    sortie.push(a, b, c);
    return;
  }
  const m = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const ab = m(a, b), bc = m(b, c), ca = m(c, a);
  subdiviser(a, ab, ca, areteMax, sortie, profondeur + 1);
  subdiviser(ab, b, bc, areteMax, sortie, profondeur + 1);
  subdiviser(ca, bc, c, areteMax, sortie, profondeur + 1);
  subdiviser(ab, bc, ca, areteMax, sortie, profondeur + 1);
}

/** Géométrie du massif (polygones triangulés), posée sur le relief. */
export function geometrieMassif(contours: Pt[][], altitudeEn: (x: number, y: number) => number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const contour of contours) {
    if (contour.length < 3) continue;
    const contourV2 = contour.map(([x, y]) => new THREE.Vector2(x, y));
    const faces = THREE.ShapeUtils.triangulateShape(contourV2, []);
    const tri: Pt[] = [];
    for (const [i, j, k] of faces) subdiviser(contour[i], contour[j], contour[k], ARETE_MAX, tri);
    for (const [x, y] of tri) positions.push(...planVers3D(x, y, altitudeEn(x, y) + DECALAGE_MASSIF));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

const VERTEX_SILHOUETTE = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT_SILHOUETTE = `
uniform sampler2D map;
uniform vec3 couleur;
varying vec2 vUv;
void main() {
  if (texture2D(map, vUv).a < 0.1) discard;
  gl_FragColor = vec4(couleur, 1.0);
}`;

function lirePixels(gl: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, largeur: number, hauteur: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(largeur * hauteur * 4);
  gl.readRenderTargetPixels(rt, 0, 0, largeur, hauteur, buf);
  retournerVerticalement(buf, largeur, hauteur);
  return buf;
}

export function capturerCouches(params: {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  largeur: number;
  hauteur: number;
  contoursMassif: Pt[][];
  altitudeEn: (x: number, y: number) => number;
  /** Couleur de carte de chaque matériau (id → « #RRGGBB »). */
  couleursCarte?: Map<string, string>;
  /** Existant : disques au sol (centre plan, rayon), dessinés avec les volumes dans la passe « existant ». */
  disquesExistant?: { centre: Pt; rayon: number }[];
}): CouchesCapturees {
  const { gl, scene, camera, largeur, hauteur, contoursMassif, altitudeEn } = params;
  const couleursCarte = params.couleursCarte ?? new Map<string, string>();

  const cibleInitiale = gl.getRenderTarget();
  const couleurFond = gl.getClearColor(new THREE.Color());
  const alphaFond = gl.getClearAlpha();

  // Objets exclus des rendus (anneau de sélection, aperçu de pose)
  const masques: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData?.horsRendu && o.visible) { o.visible = false; masques.push(o); }
  });
  // Matériaux toujours capturés, même masqués à l'écran
  const reaffiches: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData?.groupeMateriaux && !o.visible) { o.visible = true; reaffiches.push(o); }
  });

  const rtCouche = new THREE.WebGLRenderTarget(largeur, hauteur, { samples: 4 });
  rtCouche.texture.colorSpace = THREE.SRGBColorSpace;
  const rtMasque = new THREE.WebGLRenderTarget(largeur, hauteur);
  const rtCarte = new THREE.WebGLRenderTarget(largeur, hauteur);
  const rtExistant = new THREE.WebGLRenderTarget(largeur, hauteur);

  const materiauxOrigine = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const materiauxTemp: THREE.Material[] = [];
  let massif: THREE.Mesh | null = null;

  try {
    // 1. Couche 3D (végétaux + ombres), fond transparent
    gl.setRenderTarget(rtCouche);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, camera);
    const couche = lirePixels(gl, rtCouche, largeur, hauteur);
    depremultiplier(couche);

    // 2. Masque de scène
    const profondeurSeule = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    const blanc = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    materiauxTemp.push(profondeurSeule, blanc);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material & { map?: THREE.Texture | null };
      if (typeof mesh.userData?.vegetalId === "string" && mat?.map) {
        const silhouette = new THREE.ShaderMaterial({
          uniforms: { map: { value: mat.map }, couleur: { value: new THREE.Color(1, 1, 1) } },
          vertexShader: VERTEX_SILHOUETTE,
          fragmentShader: FRAGMENT_SILHOUETTE,
          side: THREE.DoubleSide,
        });
        materiauxTemp.push(silhouette);
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = silhouette;
      } else if ((mat as THREE.Material)?.type === "ShadowMaterial") {
        // Terrain : occultant, sans couleur
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = profondeurSeule;
      } else if (mesh.userData?.materiau3D) {
        // Matériaux du projet : dans la zone retouchée
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = blanc;
      }
    });

    if (contoursMassif.length > 0) {
      const matMassif = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      materiauxTemp.push(matMassif);
      massif = new THREE.Mesh(geometrieMassif(contoursMassif, altitudeEn), matMassif);
      scene.add(massif);
    }

    gl.setRenderTarget(rtMasque);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, camera);
    const masqueScene = lirePixels(gl, rtMasque, largeur, hauteur);
    if (massif) { scene.remove(massif); massif.geometry.dispose(); massif = null; }

    // 3. Carte des matériaux : couleurs franches, végétaux en silhouettes noires (occultants)
    for (const [mesh, mat] of materiauxOrigine) mesh.material = mat;
    materiauxOrigine.clear();
    const noir = new THREE.Color(0, 0, 0);
    const parCouleur = new Map<string, THREE.MeshBasicMaterial>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material & { map?: THREE.Texture | null };
      if (typeof mesh.userData?.vegetalId === "string" && mat?.map) {
        const silhouette = new THREE.ShaderMaterial({
          uniforms: { map: { value: mat.map }, couleur: { value: noir } },
          vertexShader: VERTEX_SILHOUETTE, fragmentShader: FRAGMENT_SILHOUETTE, side: THREE.DoubleSide,
        });
        materiauxTemp.push(silhouette);
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = silhouette;
      } else if ((mat as THREE.Material)?.type === "ShadowMaterial") {
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = profondeurSeule;
      } else if (mesh.userData?.materiau3D) {
        const hex = couleursCarte.get(mesh.userData.materiauId as string) ?? "#000000";
        let m = parCouleur.get(hex);
        if (!m) {
          // Couleur posée en linéaire : écrite telle quelle dans la cible (valeurs exactes)
          const v = parseInt(hex.slice(1), 16);
          const c = new THREE.Color().setRGB(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, THREE.LinearSRGBColorSpace);
          m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false });
          parCouleur.set(hex, m);
          materiauxTemp.push(m);
        }
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = m;
      }
    });
    const ancienEspace = gl.outputColorSpace;
    gl.outputColorSpace = THREE.LinearSRGBColorSpace; // couleurs exactes (pas de conversion sRGB)
    gl.setRenderTarget(rtCarte);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, camera);
    gl.outputColorSpace = ancienEspace;
    const carte = lirePixels(gl, rtCarte, largeur, hauteur);

    // 4. Existant : volumes et disques au sol en blanc, occultés par le terrain et les bâtiments ;
    //    végétaux et matériaux du projet masqués (le masque garde ce qui est devant l'existant)
    for (const [mesh, mat] of materiauxOrigine) mesh.material = mat;
    materiauxOrigine.clear();
    const blancExistant = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    materiauxTemp.push(blancExistant);
    const caches: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      if (mesh.userData?.masquant) {
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = blancExistant;
      } else if (typeof mesh.userData?.vegetalId === "string" || mesh.userData?.materiau3D) {
        if (mesh.visible) { mesh.visible = false; caches.push(mesh); }
      } else if (mat?.type === "ShadowMaterial") {
        materiauxOrigine.set(mesh, mesh.material);
        mesh.material = profondeurSeule;
      }
    });
    const disques = (params.disquesExistant ?? []).map((d) => Array.from({ length: 48 }, (_, i) => {
      const a = (2 * Math.PI * i) / 48;
      return [d.centre[0] + d.rayon * Math.cos(a), d.centre[1] + d.rayon * Math.sin(a)] as Pt;
    }));
    let disquesMesh: THREE.Mesh | null = null;
    if (disques.length > 0) {
      disquesMesh = new THREE.Mesh(geometrieMassif(disques, altitudeEn), blancExistant);
      scene.add(disquesMesh);
    }
    gl.setRenderTarget(rtExistant);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, camera);
    const existant = lirePixels(gl, rtExistant, largeur, hauteur);
    if (disquesMesh) { scene.remove(disquesMesh); disquesMesh.geometry.dispose(); }
    for (const o of caches) o.visible = true;

    return { largeur, hauteur, couche, masqueScene, carte, existant };
  } finally {
    for (const [mesh, mat] of materiauxOrigine) mesh.material = mat;
    if (massif) { scene.remove(massif); massif.geometry.dispose(); }
    for (const m of materiauxTemp) m.dispose();
    for (const o of masques) o.visible = true;
    for (const o of reaffiches) o.visible = false;
    rtCouche.dispose();
    rtMasque.dispose();
    rtCarte.dispose();
    rtExistant.dispose();
    gl.setRenderTarget(cibleInitiale);
    gl.setClearColor(couleurFond, alphaFond);
  }
}

/** Encode des pixels RGBA en PNG (navigateur). */
export function versPng(donnees: Uint8ClampedArray, largeur: number, hauteur: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(donnees), largeur, hauteur), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encodage PNG impossible"))), "image/png");
  });
}
