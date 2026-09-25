-- ============================================================
-- Migration 00003 — Jeton d'identification du lead
-- ============================================================

ALTER TABLE leads ADD COLUMN jeton_hash text;

CREATE UNIQUE INDEX idx_leads_jeton_hash ON leads (jeton_hash);
