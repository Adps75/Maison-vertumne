-- ============================================================
-- Migration 00007 — Analyse IA et suivi
-- ============================================================

BEGIN;

CREATE TYPE analyse_statut AS ENUM ('en_attente', 'en_cours', 'terminee', 'erreur');

ALTER TABLE leads ADD COLUMN analyse_statut analyse_statut NOT NULL DEFAULT 'en_attente';
ALTER TABLE leads ADD COLUMN analyse_date timestamptz;
ALTER TABLE leads ADD COLUMN analyse_modele text;
ALTER TABLE leads ADD COLUMN analyse_usage jsonb;
ALTER TABLE leads ADD COLUMN analyse_erreur text;
ALTER TABLE leads ADD COLUMN analyse_empreinte text;
ALTER TABLE leads ADD COLUMN analyse_debut timestamptz;

-- analyse_ia, score_valeur, score_chaleur, categorie existent déjà (migration 00001).

COMMIT;
