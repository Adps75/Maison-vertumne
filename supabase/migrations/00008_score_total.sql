-- ============================================================
-- Migration 00008 — Score total
-- ============================================================
-- score_valeur = intérêt (sur 40), score_chaleur = fiabilité (sur 60)
-- Le renommage des colonnes se fera dans une migration ultérieure.

ALTER TABLE leads ADD COLUMN score_total integer;
