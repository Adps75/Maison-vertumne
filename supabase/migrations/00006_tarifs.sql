-- ============================================================
-- Migration 00006 — Grille tarifaire et paramètres d'estimation
-- ============================================================

BEGIN;

-- ---------- Nouvelles colonnes sur tarifs ----------

ALTER TABLE tarifs ADD COLUMN type_lieu type_lieu NOT NULL DEFAULT 'maison';
-- mode : "part" (prix × surface × part) ou "global" (prix × surface totale)
ALTER TABLE tarifs ADD COLUMN mode text NOT NULL DEFAULT 'part';
-- part_defaut : fraction décimale (0.30 = 30 %)
ALTER TABLE tarifs ADD COLUMN part_defaut numeric;

-- Remplacer la contrainte d'unicité
ALTER TABLE tarifs DROP CONSTRAINT IF EXISTS tarifs_type_amenagement_key;
ALTER TABLE tarifs ADD CONSTRAINT tarifs_type_lieu_type_amenagement_key
  UNIQUE (type_lieu, type_amenagement);

-- ---------- Table paramètres ----------

CREATE TABLE parametres_estimation (
  cle    text PRIMARY KEY,
  valeur jsonb NOT NULL
);

ALTER TABLE parametres_estimation ENABLE ROW LEVEL SECURITY;

-- ---------- Grille tarifaire maison ----------

INSERT INTO tarifs (type_lieu, type_amenagement, prix_m2_min, prix_m2_max, mode, part_defaut, forfait_minimum) VALUES
  ('maison', 'creation_complete', 60,  160, 'part',   1.00, 3000),
  ('maison', 'massifs',           25,  70,  'part',   0.30, 500),
  ('maison', 'arbres_haies',      6,   25,  'global', NULL, 600),
  ('maison', 'gazon',             10,  25,  'part',   0.60, 400),
  ('maison', 'terrasse_bois',     110, 250, 'part',   0.20, 2500),
  ('maison', 'terrasse_minerale', 100, 260, 'part',   0.20, 2500),
  ('maison', 'allees',            50,  150, 'part',   0.10, 800),
  ('maison', 'clotures',          15,  50,  'global', NULL, 1500),
  ('maison', 'arrosage',          10,  20,  'global', NULL, 1200),
  ('maison', 'eclairage',         5,   15,  'global', NULL, 800);

-- ---------- Grille tarifaire appartement ----------

INSERT INTO tarifs (type_lieu, type_amenagement, prix_m2_min, prix_m2_max, mode, part_defaut, forfait_minimum) VALUES
  ('appartement', 'bacs_jardinieres', 80,  250, 'part',   0.40, 600),
  ('appartement', 'plantations',      40,  120, 'part',   0.40, 300),
  ('appartement', 'platelage',        90,  220, 'part',   0.80, 1000),
  ('appartement', 'brise_vue',        20,  60,  'global', NULL, 500),
  ('appartement', 'arrosage',         15,  40,  'global', NULL, 400),
  ('appartement', 'eclairage',        10,  30,  'global', NULL, 300);

-- ---------- Paramètres d'estimation ----------

INSERT INTO parametres_estimation (cle, valeur) VALUES
  ('degressivite', '{
    "seuil_bas": 30,
    "coeff_bas": 1.15,
    "seuil_haut": 200,
    "coeff_haut": 0.9
  }'),
  ('coeff_logistique', '{
    "etage_sans_supplement": 1,
    "ascenseur": 1.10,
    "escalier_base": 1.10,
    "escalier_par_etage_sup": 0.05,
    "escalier_plafond": 1.50,
    "monte_charge": 1.20,
    "exterieur": 1.20
  }'),
  ('surface_defaut', '{
    "maison": 75,
    "appartement": 15,
    "elargissement_min": 0.8,
    "elargissement_max": 1.3
  }');

COMMIT;
