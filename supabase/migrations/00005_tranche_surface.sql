-- ============================================================
-- Migration 00005 — Tranche de surface
-- ============================================================

ALTER TABLE leads ADD COLUMN tranche_surface text;
