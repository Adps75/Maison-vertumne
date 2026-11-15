-- Matériaux du projet (première version de l'étape « calques et matériaux ») et styles
-- prédéfinis du rendu IA.
--
-- 1. materiaux : bibliothèque de matériaux de l'atelier (comme la table plantes),
--    affectés aux tracés et surfaces du plan (proprietes.materiau_id des éléments).
-- 2. conception_styles_references : 1 à 3 images de référence par style de rendu,
--    communes à l'atelier, remplaçables (désactivées, jamais effacées : chaque rendu
--    garde la trace de celles qu'il a utilisées).
-- 3. conception_rendus : nouveaux styles, consigne envoyée, références utilisées,
--    consignes supplémentaires, annotations.
-- 4. conception_projets : style de rendu du projet (le même pour toutes les vues).

BEGIN;

-- ─── 1. Matériaux ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiaux (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL UNIQUE,
  type           text NOT NULL CHECK (type IN ('surface', 'lineaire')),
  description_ia text NOT NULL,
  couleur        text NOT NULL,
  hachure        text NOT NULL DEFAULT 'aucune' CHECK (hachure IN ('aucune', 'diagonale', 'croisee', 'points')),
  unite          text NOT NULL CHECK (unite IN ('m2', 'ml')),
  prix_unitaire  numeric(10, 2),
  -- Largeur visible d'un matériau linéaire (masque du rendu, trait du plan)
  largeur_m      numeric(6, 3),
  ordre          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'surface' AND unite = 'm2') OR (type = 'lineaire' AND unite = 'ml'))
);

ALTER TABLE materiaux ENABLE ROW LEVEL SECURITY;

INSERT INTO materiaux (nom, type, description_ia, couleur, hachure, unite, largeur_m, ordre) VALUES
  ('Volige acier', 'lineaire',
   'bordure en volige d''acier : fine lame métallique verticale gris anthracite, affleurant le sol, qui dessine une ligne nette entre les matériaux',
   '#4A4F55', 'aucune', 'ml', 0.02, 1),
  ('Bordure pierre', 'lineaire',
   'bordure en pierre naturelle calcaire beige, blocs posés bout à bout en ligne régulière',
   '#A89F91', 'aucune', 'ml', 0.12, 2),
  ('Paillage écorce de pin', 'surface',
   'paillage d''écorce de pin brun-rouge couvrant tout le sol entre les plantes',
   '#7A4A2A', 'points', 'm2', NULL, 3),
  ('Paillage minéral', 'surface',
   'paillage minéral de graviers concassés gris-beige couvrant le sol entre les plantes',
   '#BDB6A8', 'points', 'm2', NULL, 4),
  ('Gazon (rénovation)', 'surface',
   'pelouse rénovée : gazon dense, vert franc et uniforme, tondu court, sans zone sèche',
   '#6DA34D', 'aucune', 'm2', NULL, 5),
  ('Gravier', 'surface',
   'allée ou aire en gravier roulé clair, surface plane et régulière',
   '#D8D0BF', 'diagonale', 'm2', NULL, 6)
ON CONFLICT (nom) DO NOTHING;

-- ─── 2. Images de référence des styles ────────────────────────────────────

CREATE TABLE IF NOT EXISTS conception_styles_references (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style       text NOT NULL CHECK (style IN ('croquis', 'aquarelle', 'feutres', 'realiste')),
  path        text NOT NULL,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conception_styles_references_style
  ON conception_styles_references(style) WHERE actif;

ALTER TABLE conception_styles_references ENABLE ROW LEVEL SECURITY;

-- ─── 3. Rendus ─────────────────────────────────────────────────────────────

ALTER TABLE conception_rendus DROP CONSTRAINT IF EXISTS conception_rendus_style_check;
ALTER TABLE conception_rendus ADD CONSTRAINT conception_rendus_style_check
  CHECK (style IN ('croquis', 'aquarelle', 'feutres', 'realiste', 'dessin_filtre', 'dessin_ia'));

ALTER TABLE conception_rendus
  ADD COLUMN IF NOT EXISTS consigne text,
  ADD COLUMN IF NOT EXISTS consigne_style text,
  ADD COLUMN IF NOT EXISTS references_utilisees jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consignes_sup text,
  ADD COLUMN IF NOT EXISTS annotations boolean NOT NULL DEFAULT false;

-- ─── 4. Style de rendu du projet ───────────────────────────────────────────

ALTER TABLE conception_projets
  ADD COLUMN IF NOT EXISTS rendu_style text NOT NULL DEFAULT 'croquis'
    CHECK (rendu_style IN ('croquis', 'aquarelle', 'feutres', 'realiste')),
  ADD COLUMN IF NOT EXISTS rendu_annotations boolean NOT NULL DEFAULT false;

COMMIT;
