import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import { pointDansPolygone } from "../../geo/plan";
import { ecartementMinimal, type VoisineInfo } from "../../vegetaux/ecartement";
import {
  placerComposition, repereMassif, profondeurRelative, lateral, symetrique,
  distanceAuBord, margeBord, groupeImpair, couvertureSurface, quantitesCalculees, surfaceParPlante,
  type PlanteAPlacer, type ResultatPlacement, type CercleExclusion, type Densite,
} from "../placement";
import { creerAleatoire } from "../aleatoire";
import { toleranceDensite } from "../application";

// Massif rectangulaire 10 m × 4 m, devant au sud (vers y négatif)
const RECT: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
const VERS_SUD: Pt = [0, -1];
// Massif en L
const L_FORME: Pt[] = [[0, 0], [12, 0], [12, 3], [4, 3], [4, 8], [0, 8]];
// Massif concave (en U)
const CONCAVE: Pt[] = [[0, 0], [10, 0], [10, 8], [7, 8], [6, 3], [4, 3], [3, 8], [0, 8]];
// Massif avec un existant conservé au centre
const CARRE: Pt[] = [[0, 0], [8, 0], [8, 6], [0, 6]];
const EXISTANT_CENTRE: CercleExclusion[] = [{ centre: [4, 3], rayon: 1 }];
// Massif réel irrégulier (cas de la livraison : vue principale à l'est, if conservé au sud-est)
const REEL: Pt[] = [[7.38, 12.44], [12.73, 13.38], [12.95, 12.57], [13.71, 12.69], [13.49, 14.24], [14.62, 14.49], [14.82, 14.12], [14.9, 13.35], [14.87, 12.74], [14.72, 12.2], [14.33, 11.73], [13.86, 11.26], [13, 10.62], [12.41, 10.22], [11.77, 9.68], [11.42, 9.26], [11.25, 8.75], [11.22, 7.91], [11.42, 7.32], [11.69, 6.92], [12.09, 6.55], [12.65, 6.26], [13.1, 6.06], [13.47, 5.84], [13.84, 5.47], [14.03, 4.95], [14.08, 4.14], [14.13, 3.62], [14.18, 3.18], [8.34, 2.61]];
const REEL_EXCLUSIONS: CercleExclusion[] = [{ centre: [14, 4.5], rayon: 1 }, { centre: [11.2, 12.29], rayon: 1 }];

const plante = (cle: string, o: Partial<PlanteAPlacer>): PlanteAPlacer => ({
  cle, rayon: 0.25, hauteur: 0.6, categorie: "vivace", forme: null,
  role: "masse", profondeur: "milieu", part: 0.2, nombre: null, tailleGroupe: 5, repetitions: 3, ...o,
});

const PALETTE: PlanteAPlacer[] = [
  plante("structure", { categorie: "arbuste", rayon: 0.35, hauteur: 1, role: "structure", nombre: 3, part: 0, tailleGroupe: 1 }),
  plante("haute", { categorie: "arbuste", rayon: 0.35, hauteur: 1.2, profondeur: "fond", part: 0.25, repetitions: 4 }),
  plante("graminee", { categorie: "graminee", rayon: 0.22, hauteur: 0.6, role: "fond", part: 0.25, repetitions: 5 }),
  plante("moyenne", { rayon: 0.21, hauteur: 0.8, part: 0.15 }),
  plante("basse", { rayon: 0.22, hauteur: 0.4, profondeur: "devant", part: 0.15 }),
  plante("bordure", { categorie: "graminee", rayon: 0.17, hauteur: 0.3, role: "bordure", profondeur: "devant", part: 0.08 }),
  plante("couvre-sol", { categorie: "couvre_sol", rayon: 0.25, hauteur: 0.2, role: "couvre_sol", profondeur: "devant", part: 0.12 }),
];

const TOLERANCE = 0.3;

function composer(contour: Pt[], o: {
  plantes?: PlanteAPlacer[]; graine?: number; geometrique?: boolean; existantes?: VoisineInfo[];
  exclusions?: CercleExclusion[]; densite?: Densite; observateur?: Pt | null; versDevant?: Pt;
} = {}): ResultatPlacement {
  return placerComposition({
    contour, plantes: o.plantes ?? PALETTE, versDevant: o.versDevant ?? VERS_SUD, observateur: o.observateur ?? null,
    // Tolérance ajustée à la densité, comme dans l'application
    geometrique: o.geometrique ?? false, tolerance: toleranceDensite(TOLERANCE, o.densite ?? "standard"), densite: o.densite ?? "standard",
    existantes: o.existantes ?? [], graine: o.graine ?? 42, exclusions: o.exclusions,
  });
}

function infos(r: ResultatPlacement, plantes = PALETTE): VoisineInfo[] {
  const parCle = new Map(plantes.map((p) => [p.cle, p]));
  return r.placements.map((pl, i) => {
    const p = parCle.get(pl.cle)!;
    return { id: `p${i}`, position: pl.position, rayon: p.rayon, categorie: p.categorie, forme: p.forme };
  });
}

function conflits(liste: VoisineInfo[], tolerance = TOLERANCE): string[] {
  const out: string[] = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const a = liste[i], b = liste[j];
    const dMin = ecartementMinimal(a, b, tolerance);
    const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
    if (dMin > 0 && d < dMin - 1e-6) out.push(`${a.id}/${b.id} ${d.toFixed(3)} < ${dMin.toFixed(3)}`);
  }
  return out;
}

/** Couverture mesurée indépendamment (échantillonnage 5 cm). */
function couverture(r: ResultatPlacement, contour: Pt[], exclusions: CercleExclusion[] = [], plantes = PALETTE): number {
  const parCle = new Map(plantes.map((p) => [p.cle, p]));
  return couvertureSurface({ contour, exclusions, plantes: r.placements.map((x) => ({ position: x.position, rayon: parCle.get(x.cle)!.rayon })) }).couverture;
}

/** Plus grand vide : rayon du plus grand disque de la surface plantable sans aucune couronne. */
function plusGrandVide(r: ResultatPlacement, contour: Pt[], exclusions: CercleExclusion[] = []): number {
  const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
  const xs = contour.map((p) => p[0]), ys = contour.map((p) => p[1]);
  let max = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) {
    const p: Pt = [x, y];
    if (!pointDansPolygone(p, contour) || exclusions.some((c) => Math.hypot(x - c.centre[0], y - c.centre[1]) < c.rayon)) continue;
    let d = Infinity;
    for (const pl of r.placements) d = Math.min(d, Math.hypot(x - pl.position[0], y - pl.position[1]) - parCle.get(pl.cle)!.rayon);
    max = Math.max(max, d);
  }
  return max;
}

const CAS: { nom: string; contour: Pt[]; exclusions?: CercleExclusion[]; observateur: Pt }[] = [
  { nom: "rectangle", contour: RECT, observateur: [5, -6] },
  { nom: "en L", contour: L_FORME, observateur: [16, 1.5] },
  { nom: "concave", contour: CONCAVE, observateur: [14, 4] },
  { nom: "existant au centre", contour: CARRE, exclusions: EXISTANT_CENTRE, observateur: [12, 3] },
  { nom: "massif réel irrégulier", contour: REEL, exclusions: REEL_EXCLUSIONS, observateur: [31, 9] },
];

describe("placement : contraintes", () => {
  for (const c of CAS) {
    it(`${c.nom} : dans le contour, marge au bord, hors de l'existant, aucun conflit`, () => {
      const r = composer(c.contour, { exclusions: c.exclusions, observateur: c.observateur });
      expect(r.placements.length).toBeGreaterThan(20);
      const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
      for (const pl of r.placements) {
        expect(pointDansPolygone(pl.position, c.contour)).toBe(true);
        expect(distanceAuBord(pl.position, c.contour)).toBeGreaterThanOrEqual(margeBord(parCle.get(pl.cle)!.rayon) - 1e-6);
        for (const e of c.exclusions ?? []) {
          expect(Math.hypot(pl.position[0] - e.centre[0], pl.position[1] - e.centre[1])).toBeGreaterThanOrEqual(e.rayon);
        }
      }
      expect(conflits(infos(r))).toEqual([]);
    });
  }

  it("respecte les plantes existantes", () => {
    const existante: VoisineInfo = { id: "ex", position: [5, 2], rayon: 1.2, categorie: "arbuste", forme: null };
    const r = composer(RECT, { graine: 7, existantes: [existante] });
    expect(conflits([existante, ...infos(r)])).toEqual([]);
  });
});

describe("placement : toute la surface plantée", () => {
  for (const c of CAS) {
    it(`${c.nom} : couverture ≥ 85 % en densité standard, aucune zone vide`, () => {
      const r = composer(c.contour, { exclusions: c.exclusions, observateur: c.observateur });
      expect(couverture(r, c.contour, c.exclusions)).toBeGreaterThanOrEqual(0.85);
      expect(r.couverture).toBeGreaterThanOrEqual(0.85);
      // Aucun vide de plus de 1,5 × le plus grand diamètre à 3 ans (0,70 m)
      expect(2 * plusGrandVide(r, c.contour, c.exclusions)).toBeLessThan(1.5 * 0.7);
    });
  }

  it("aucune bande vide : chaque tranche de profondeur est plantée", () => {
    const r = composer(CONCAVE, { observateur: [14, 4] });
    const cv = (x0: number, x1: number) => {
      const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
      let n = 0, c = 0;
      for (let x = x0; x < x1; x += 0.1) for (let y = 0; y < 8; y += 0.1) {
        if (!pointDansPolygone([x, y], CONCAVE)) continue;
        n++;
        if (r.placements.some((pl) => Math.hypot(x - pl.position[0], y - pl.position[1]) <= parCle.get(pl.cle)!.rayon)) c++;
      }
      return c / n;
    };
    for (let x = 0; x < 10; x += 2) expect(cv(x, x + 2)).toBeGreaterThan(0.75);
  });

  it("objectifs de couverture selon la densité : 92 % serrée, 85 % standard, 75 % aérée", () => {
    const serree = composer(L_FORME, { densite: "serree", observateur: [16, 1.5] });
    const standard = composer(L_FORME, { densite: "standard", observateur: [16, 1.5] });
    const aeree = composer(L_FORME, { densite: "aeree", observateur: [16, 1.5] });
    expect(couverture(serree, L_FORME)).toBeGreaterThanOrEqual(0.92);
    expect(couverture(standard, L_FORME)).toBeGreaterThanOrEqual(0.85);
    expect(couverture(aeree, L_FORME)).toBeGreaterThanOrEqual(0.75);
    expect(serree.placements.length).toBeGreaterThan(standard.placements.length);
    expect(standard.placements.length).toBeGreaterThan(aeree.placements.length);
  });

  it("la surface plantable exclut l'existant conservé", () => {
    const r = composer(CARRE, { exclusions: EXISTANT_CENTRE, observateur: [12, 3] });
    expect(r.surfacePlantable).toBeCloseTo(48 - Math.PI, 0);
  });
});

describe("placement : profondeur (vue principale)", () => {
  const moyenne = (r: ResultatPlacement, cle: string, s: (p: Pt) => number) => {
    const ps = r.placements.filter((p) => p.cle === cle).map((p) => s(p.position));
    return ps.reduce((a, b) => a + b, 0) / ps.length;
  };

  it("les plus hautes au fond, les plus basses devant (gradient)", () => {
    const r = composer(RECT);
    const rep = repereMassif(RECT, VERS_SUD);
    const s = (p: Pt) => profondeurRelative(rep, p);
    expect(moyenne(r, "haute", s)).toBeLessThan(moyenne(r, "moyenne", s));
    expect(moyenne(r, "moyenne", s)).toBeLessThan(moyenne(r, "basse", s));
    expect(moyenne(r, "basse", s)).toBeLessThan(moyenne(r, "bordure", s));
  });

  it("contour en L : la profondeur suit la distance au point de vue", () => {
    const obs: Pt = [16, 1.5];
    const r = composer(L_FORME, { observateur: obs });
    const d = (p: Pt) => Math.hypot(p[0] - obs[0], p[1] - obs[1]);
    // Les hautes sont en moyenne plus loin du point de vue que les basses
    expect(moyenne(r, "haute", d)).toBeGreaterThan(moyenne(r, "basse", d));
    expect(moyenne(r, "moyenne", d)).toBeGreaterThan(moyenne(r, "bordure", d));
  });

  it("bordure du côté du devant", () => {
    const r = composer(RECT);
    const rep = repereMassif(RECT, VERS_SUD);
    const bord = r.placements.filter((x) => x.cle === "bordure").map((p) => profondeurRelative(rep, p.position));
    expect(bord.reduce((a, b) => a + b, 0) / bord.length).toBeGreaterThan(0.7);
  });

  it("groupes et répétitions : chaque espèce forme plusieurs taches", () => {
    const r = composer(L_FORME, { observateur: [16, 1.5] });
    for (const cle of ["haute", "graminee"]) {
      const ps = r.placements.filter((p) => p.cle === cle).map((p) => p.position);
      // Composantes connexes (voisins à moins de 2,2 × le rayon)
      const p = PALETTE.find((x) => x.cle === cle)!;
      const vu = new Set<number>();
      let taches = 0;
      for (let i = 0; i < ps.length; i++) {
        if (vu.has(i)) continue;
        taches++;
        const pile = [i];
        vu.add(i);
        while (pile.length) {
          const a = pile.pop()!;
          for (let j = 0; j < ps.length; j++) {
            if (!vu.has(j) && Math.hypot(ps[a][0] - ps[j][0], ps[a][1] - ps[j][1]) < 2.1 * p.rayon) { vu.add(j); pile.push(j); }
          }
        }
      }
      expect(taches, cle).toBeGreaterThanOrEqual(p.repetitions - 1);
    }
  });
});

describe("placement : quantités calculées", () => {
  it("nombre fixe pour la structure, surface restante répartie selon les parts", () => {
    const q = quantitesCalculees(PALETTE, 40, 0.9);
    expect(q.get("structure")).toBe(3);
    const fixe = 3 * surfaceParPlante(0.35, 0.9);
    const occupee = PALETTE.filter((p) => p.nombre === null).reduce((s, p) => s + q.get(p.cle)! * surfaceParPlante(p.rayon, 0.9), 0);
    expect(occupee).toBeGreaterThan((40 - fixe) * 0.95);
    expect(occupee).toBeLessThan((40 - fixe) * 1.05);
    // Part de surface : « haute » (25 %) occupe environ 25 % de la surface restante
    expect(q.get("haute")! * surfaceParPlante(0.35, 0.9) / (40 - fixe)).toBeCloseTo(0.25 / 1.0, 1);
  });

  it("parts normalisées, et répartition égale si aucune part", () => {
    const deux = [plante("a", { part: 30 }), plante("b", { part: 30 })];
    const q = quantitesCalculees(deux, 10, 0.9);
    expect(q.get("a")).toBe(q.get("b"));
    const sans = quantitesCalculees([plante("a", { part: 0 }), plante("b", { part: 0 })], 10, 0.9);
    expect(sans.get("a")).toBeGreaterThan(0);
    expect(sans.get("a")).toBe(sans.get("b"));
  });

  it("structure en nombre fixe : nombre respecté quand la place suffit", () => {
    const r = composer(L_FORME, { observateur: [16, 1.5] });
    expect(r.placements.filter((p) => p.cle === "structure").length).toBe(3);
    expect(r.quantites.structure).toBe(3);
  });

  it("massif trop petit : écart signalé pour le nombre fixe, jamais de dépassement", () => {
    const petit: Pt[] = [[0, 0], [2, 0], [2, 1.5], [0, 1.5]];
    const p = [plante("gros", { categorie: "arbuste", rayon: 0.8, role: "structure", nombre: 6, part: 0 })];
    const r = composer(petit, { plantes: p });
    const n = r.placements.length;
    expect(n).toBeLessThan(6);
    expect(r.ecarts).toEqual([{ cle: "gros", demande: 6, place: n }]);
    expect(conflits(infos(r, p))).toEqual([]);
  });
});

describe("placement : mode géométrique", () => {
  const GEO: PlanteAPlacer[] = [
    plante("buis", { categorie: "arbuste", forme: "boule", rayon: 0.4, hauteur: 0.8, role: "structure", nombre: 5, part: 0, tailleGroupe: 1 }),
    plante("masse", { rayon: 0.3, hauteur: 0.6, role: "masse", part: 0.7, tailleGroupe: 3, repetitions: 2 }),
    plante("ponctuation", { categorie: "graminee", rayon: 0.3, hauteur: 0.9, role: "ponctuation", profondeur: "fond", nombre: 3, part: 0, tailleGroupe: 1 }),
    plante("couvre", { categorie: "couvre_sol", rayon: 0.25, hauteur: 0.2, role: "couvre_sol", part: 0.3 }),
  ];

  it("symétrie respectée par rapport à l'axe du massif", () => {
    const r = composer(RECT, { plantes: GEO, graine: 11, geometrique: true });
    const rep = repereMassif(RECT, VERS_SUD);
    expect(r.placements.length).toBeGreaterThan(10);
    for (const cle of ["buis", "masse", "ponctuation", "couvre"]) {
      const ps = r.placements.filter((p) => p.cle === cle).map((p) => p.position);
      for (const p of ps) {
        const s = symetrique(rep, p);
        const trouve = ps.some((q) => Math.hypot(q[0] - s[0], q[1] - s[1]) < 2e-3);
        expect(trouve, `${cle} ${p} sans symétrique ${s}`).toBe(true);
      }
    }
    expect(r.placements.filter((p) => p.cle === "ponctuation").length).toBe(3);
  });

  it("sujets de structure en alignement régulier", () => {
    const r = composer(RECT, { plantes: GEO, graine: 11, geometrique: true });
    const rep = repereMassif(RECT, VERS_SUD);
    const buis = r.placements.filter((p) => p.cle === "buis").map((p) => p.position);
    expect(buis.length).toBe(5);
    const s = buis.map((p) => profondeurRelative(rep, p));
    for (const v of s) expect(v).toBeCloseTo(s[0], 6); // même ligne
    const l = buis.map((p) => lateral(rep, p)).sort((a, b) => a - b);
    const pas = l[1] - l[0];
    for (let i = 2; i < l.length; i++) expect(l[i] - l[i - 1]).toBeCloseTo(pas, 6); // pas régulier
  });

  it("aucun conflit et surface couverte en mode géométrique", () => {
    const r = composer(RECT, { plantes: GEO, graine: 11, geometrique: true });
    expect(conflits(infos(r, GEO), TOLERANCE)).toEqual([]);
    expect(couverture(r, RECT, [], GEO)).toBeGreaterThanOrEqual(0.8);
  });
});

describe("couverture", () => {
  it("disque unique au centre d'un carré : part exacte", () => {
    const c = couvertureSurface({ contour: [[0, 0], [2, 0], [2, 2], [0, 2]], plantes: [{ position: [1, 1], rayon: 0.5 }] });
    expect(c.surfacePlantable).toBeCloseTo(4, 1);
    expect(c.couverture).toBeCloseTo(Math.PI * 0.25 / 4, 2);
  });
});

describe("déterminisme", () => {
  it("même graine = même résultat", () => {
    expect(composer(L_FORME, { graine: 123 })).toEqual(composer(L_FORME, { graine: 123 }));
  });
  it("autre graine = autre proposition", () => {
    expect(composer(L_FORME, { graine: 123 }).placements).not.toEqual(composer(L_FORME, { graine: 124 }).placements);
  });
  it("générateur : suite reproductible, dans [0, 1[", () => {
    const a = creerAleatoire(5), b = creerAleatoire(5);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("taille de groupe impaire", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(groupeImpair)).toEqual([1, 1, 1, 3, 3, 5, 5]);
  });
});
