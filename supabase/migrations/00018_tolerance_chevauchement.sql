-- Tolérance de chevauchement pour les végétaux (0 à 0.40, défaut 0.15 = 15%)
ALTER TABLE conception_projets
  ADD COLUMN IF NOT EXISTS tolerance_chevauchement real NOT NULL DEFAULT 0.15;
