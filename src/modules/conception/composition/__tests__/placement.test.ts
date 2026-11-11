import { describe, it, expect } from "vitest";
import type { Pt } from "../../geo/plan";
import { pointDansPolygone } from "../../geo/plan";
import { ecartementMinimal, type VoisineInfo } from "../../vegetaux/ecartement";
import {
  placerComposition, repereMassif, profondeurRelative, lateral, symetrique,
  distanceAuBord, margeBord, groupeImpair, type PlanteAPlacer, type ResultatPlacement,
} from "../placement";
import { creerAleatoire } from "../aleatoire";

// Massif rectangulaire 10 m × 4 m, devant au sud (vers y négatif)
const RECT: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
const VERS_SUD: Pt = [0, -1];
// Massif en L (irrégulier)
const L_FORME: Pt[] = [[0, 0], [12, 0], [12, 3], [4, 3], [4, 8], [0, 8]];

const plante = (cle: string, o: Partial<PlanteAPlacer>): PlanteAPlacer => ({
  cle, rayon: 0.4, hauteur: 0.6, categorie: "vivace", forme: null,
  role: "masse", profondeur: "milieu", quantite: 5, tailleGroupe: 5, repetitions: 1, ...o,
});

const PALETTE: PlanteAPlacer[] = [
  plante("arbuste-fond", { categorie: "arbuste", rayon: 0.6, hauteur: 1.8, role: "fond", profondeur: "fond", quantite: 4, tailleGroupe: 1, repetitions: 4 }),
  plante("graminee", { categorie: "graminee", rayon: 0.35, hauteur: 1.0, role: "masse", profondeur: "milieu", quantite: 9, tailleGroupe: 3, repetitions: 3 }),
  plante("vivace-devant", { rayon: 0.25, hauteur: 0.4, role: "masse", profondeur: "devant", quantite: 10, tailleGroupe: 5, repetitions: 2 }),
  plante("bordure", { rayon: 0.15, hauteur: 0.25, role: "bordure", profondeur: "devant", quantite: 8, tailleGroupe: 7, repetitions: 1 }),
  plante("couvre-sol", { categorie: "couvre_sol", rayon: 0.3, hauteur: 0.1, role: "couvre_sol", profondeur: "devant", quantite: 6, tailleGroupe: 3, repetitions: 2 }),
];

function composer(contour: Pt[], plantes = PALETTE, graine = 42, geometrique = false, existantes: VoisineInfo[] = []): ResultatPlacement {
  return placerComposition({ contour, plantes, versDevant: VERS_SUD, geometrique, tolerance: 0.15, existantes, graine });
}

function infos(r: ResultatPlacement, plantes = PALETTE): VoisineInfo[] {
  const parCle = new Map(plantes.map((p) => [p.cle, p]));
  return r.placements.map((pl, i) => {
    const p = parCle.get(pl.cle)!;
    return { id: `p${i}`, position: pl.position, rayon: p.rayon, categorie: p.categorie, forme: p.forme };
  });
}

function conflits(liste: VoisineInfo[], tolerance = 0.15): string[] {
  const out: string[] = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const a = liste[i], b = liste[j];
    const dMin = ecartementMinimal(a, b, tolerance);
    const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
    if (dMin > 0 && d < dMin - 1e-6) out.push(`${a.id}/${b.id} ${d.toFixed(3)} < ${dMin.toFixed(3)}`);
  }
  return out;
}

describe("placement : contraintes", () => {
  for (const [nom, contour] of [["rectangle", RECT], ["en L", L_FORME]] as const) {
    it(`${nom} : aucune plante hors contour, marge au bord respectée`, () => {
      const r = composer(contour as Pt[]);
      expect(r.placements.length).toBeGreaterThan(20);
      const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
      for (const pl of r.placements) {
        expect(pointDansPolygone(pl.position, contour as Pt[])).toBe(true);
        expect(distanceAuBord(pl.position, contour as Pt[])).toBeGreaterThanOrEqual(margeBord(parCle.get(pl.cle)!.rayon) - 1e-6);
      }
    });

    it(`${nom} : aucun conflit d'écartement (hors strates autorisées)`, () => {
      expect(conflits(infos(composer(contour as Pt[])))).toEqual([]);
    });
  }

  it("respecte les plantes existantes", () => {
    const existante: VoisineInfo = { id: "ex", position: [5, 2], rayon: 1.2, categorie: "arbuste", forme: null };
    const r = composer(RECT, PALETTE, 7, false, [existante]);
    expect(conflits([existante, ...infos(r)])).toEqual([]);
  });
});

describe("placement : profondeur", () => {
  it("hauteurs décroissantes du fond vers le devant", () => {
    const r = composer(RECT);
    const rep = repereMassif(RECT, VERS_SUD);
    const parCle = new Map(PALETTE.map((p) => [p.cle, p]));
    const moyenne = (cle: string) => {
      const ps = r.placements.filter((p) => p.cle === cle).map((p) => profondeurRelative(rep, p.position));
      return ps.reduce((a, b) => a + b, 0) / ps.length;
    };
    // Plus la plante est haute, plus elle est au fond (profondeur relative faible)
    const ordre = ["arbuste-fond", "graminee", "vivace-devant", "bordure"];
    for (let i = 1; i < ordre.length; i++) {
      expect(parCle.get(ordre[i - 1])!.hauteur).toBeGreaterThan(parCle.get(ordre[i])!.hauteur);
      expect(moyenne(ordre[i - 1])).toBeLessThan(moyenne(ordre[i]));
    }
    // Le fond est bien du côté nord (y grand) puisque le devant est au sud
    const fond = r.placements.filter((p) => p.cle === "arbuste-fond");
    for (const p of fond) expect(p.position[1]).toBeGreaterThan(2);
  });

  it("bordure le long du bord avant", () => {
    const r = composer(RECT);
    const rep = repereMassif(RECT, VERS_SUD);
    for (const p of r.placements.filter((x) => x.cle === "bordure")) {
      expect(profondeurRelative(rep, p.position)).toBeGreaterThan(0.75);
    }
  });
});

describe("placement : quantités", () => {
  it("quantités respectées quand la place suffit", () => {
    const r = composer(RECT);
    for (const p of PALETTE) {
      const n = r.placements.filter((x) => x.cle === p.cle).length;
      const ecart = r.ecarts.find((e) => e.cle === p.cle);
      if (ecart) expect(ecart.place).toBe(n);
      else expect(n).toBe(p.quantite);
    }
    expect(r.ecarts).toEqual([]);
  });

  it("massif trop petit : écart signalé, jamais de dépassement", () => {
    const petit: Pt[] = [[0, 0], [2, 0], [2, 1.5], [0, 1.5]];
    const p = [plante("gros", { categorie: "arbuste", rayon: 0.8, quantite: 6, tailleGroupe: 3, repetitions: 2 })];
    const r = composer(petit, p);
    const n = r.placements.length;
    expect(n).toBeLessThan(6);
    expect(r.ecarts).toEqual([{ cle: "gros", demande: 6, place: n }]);
    expect(conflits(infos(r, p))).toEqual([]);
  });
});

describe("placement : mode géométrique", () => {
  const GEO: PlanteAPlacer[] = [
    plante("buis", { categorie: "arbuste", forme: "boule", rayon: 0.4, hauteur: 0.8, role: "structure", profondeur: "milieu", quantite: 5, tailleGroupe: 1, repetitions: 5 }),
    plante("masse", { rayon: 0.3, hauteur: 0.6, role: "masse", profondeur: "milieu", quantite: 8, tailleGroupe: 3, repetitions: 2 }),
    plante("ponctuation", { categorie: "graminee", rayon: 0.3, hauteur: 0.9, role: "ponctuation", profondeur: "fond", quantite: 3, tailleGroupe: 1, repetitions: 3 }),
  ];

  it("symétrie respectée par rapport à l'axe du massif", () => {
    const r = composer(RECT, GEO, 11, true);
    const rep = repereMassif(RECT, VERS_SUD);
    expect(r.placements.length).toBeGreaterThan(10);
    for (const cle of ["buis", "masse", "ponctuation"]) {
      const ps = r.placements.filter((p) => p.cle === cle).map((p) => p.position);
      for (const p of ps) {
        const s = symetrique(rep, p);
        const trouve = ps.some((q) => Math.hypot(q[0] - s[0], q[1] - s[1]) < 1e-3);
        expect(trouve, `${cle} ${p} sans symétrique ${s}`).toBe(true);
      }
    }
  });

  it("sujets de structure en alignement régulier", () => {
    const r = composer(RECT, GEO, 11, true);
    const rep = repereMassif(RECT, VERS_SUD);
    const buis = r.placements.filter((p) => p.cle === "buis").map((p) => p.position);
    expect(buis.length).toBe(5);
    const s = buis.map((p) => profondeurRelative(rep, p));
    for (const v of s) expect(v).toBeCloseTo(s[0], 6); // même ligne
    const l = buis.map((p) => lateral(rep, p)).sort((a, b) => a - b);
    const pas = l[1] - l[0];
    for (let i = 2; i < l.length; i++) expect(l[i] - l[i - 1]).toBeCloseTo(pas, 6); // pas régulier
  });

  it("aucun conflit en mode géométrique", () => {
    expect(conflits(infos(composer(RECT, GEO, 11, true), GEO))).toEqual([]);
  });
});

describe("déterminisme", () => {
  it("même graine = même résultat", () => {
    expect(composer(L_FORME, PALETTE, 123)).toEqual(composer(L_FORME, PALETTE, 123));
  });
  it("autre graine = autre proposition", () => {
    expect(composer(L_FORME, PALETTE, 123).placements).not.toEqual(composer(L_FORME, PALETTE, 124).placements);
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
