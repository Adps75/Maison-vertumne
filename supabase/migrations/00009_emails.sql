-- ============================================================
-- Migration 00009 — Emails et pré-diagnostic
-- ============================================================

BEGIN;

CREATE TABLE emails_envoyes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type          text NOT NULL,
  destinataire  text NOT NULL,
  objet         text NOT NULL,
  html          text,
  piece_jointe  text,
  statut        text NOT NULL DEFAULT 'en_cours',
  erreur        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emails_envoyes_lead_type_unique UNIQUE (lead_id, type)
);

ALTER TABLE emails_envoyes ENABLE ROW LEVEL SECURITY;

ALTER TABLE leads ADD COLUMN prediagnostic_path text;
ALTER TABLE leads ADD COLUMN prediagnostic_erreur text;

COMMIT;
