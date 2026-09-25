-- ============================================================
-- Migration 00002 — Parcours appartement
-- ============================================================

-- ---------- Nouveaux enums ----------

CREATE TYPE type_lieu AS ENUM ('maison', 'appartement');
CREATE TYPE type_espace AS ENUM ('balcon', 'terrasse', 'toit_terrasse');
CREATE TYPE type_acces AS ENUM ('ascenseur', 'escalier', 'monte_charge', 'exterieur');
CREATE TYPE orientation_espace AS ENUM (
  'nord', 'nord_est', 'est', 'sud_est',
  'sud', 'sud_ouest', 'ouest', 'nord_ouest',
  'ne_sait_pas'
);
CREATE TYPE accord_copro AS ENUM ('obtenu', 'a_demander', 'non_necessaire', 'ne_sait_pas');

-- ---------- Nouvelles colonnes sur leads ----------

ALTER TABLE leads ADD COLUMN type_lieu type_lieu NOT NULL DEFAULT 'maison';

ALTER TABLE leads ADD COLUMN type_espace type_espace;
ALTER TABLE leads ADD COLUMN surface_espace double precision;
ALTER TABLE leads ADD COLUMN etage integer CHECK (etage >= 0);
ALTER TABLE leads ADD COLUMN acces type_acces;
ALTER TABLE leads ADD COLUMN orientation_espace orientation_espace;
ALTER TABLE leads ADD COLUMN accord_copro accord_copro;

-- ---------- Légende photo ----------

ALTER TABLE photos ADD COLUMN legende text;
