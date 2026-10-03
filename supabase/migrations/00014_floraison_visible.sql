-- ============================================================
-- Migration 00014 — Champ floraison_visible
-- ============================================================

ALTER TABLE plantes ADD COLUMN floraison_visible boolean NOT NULL DEFAULT false;
