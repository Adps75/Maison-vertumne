-- ============================================================
-- Migration 00015 — Ajouter le type "zone" aux éléments de conception
-- Les zones sont des éléments ordinaires sur le calque système "zones".
-- ============================================================

BEGIN;

-- Remplacer la contrainte CHECK pour ajouter 'zone'
ALTER TABLE conception_elements
  DROP CONSTRAINT IF EXISTS conception_elements_type_check;

ALTER TABLE conception_elements
  ADD CONSTRAINT conception_elements_type_check
  CHECK (type IN ('sol','mineral','vegetal','bati','limite','cote','annotation','zone'));

COMMIT;
