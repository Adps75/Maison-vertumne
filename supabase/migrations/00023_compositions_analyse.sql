-- Analyse des vues photo calées (composition IA) : enregistrée et réutilisée.
-- La colonne s'appelle analyse_existant : ANALYSE est un mot réservé de PostgreSQL.
-- Refaite seulement si l'empreinte change (contour, vues calées utilisées, existant)
-- ou sur demande.

ALTER TABLE conception_compositions
  ADD COLUMN IF NOT EXISTS analyse_existant jsonb,
  ADD COLUMN IF NOT EXISTS analyse_empreinte text,
  ADD COLUMN IF NOT EXISTS analyse_validee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conception_compositions_analyse
  ON conception_compositions(projet_id, zone_id, analyse_empreinte)
  WHERE analyse_validee;
