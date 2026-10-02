-- ============================================================
-- Migration 00011 — Table conception_projets et bucket
-- ============================================================

BEGIN;

CREATE TABLE conception_projets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid REFERENCES leads(id),
  nom             text NOT NULL,
  adresse         text,
  -- Origine locale : coin sud-ouest de l'emprise, arrondi au mètre [x, y] en Lambert 93
  origine_l93     jsonb,
  -- Géométries en mètres relatifs à l'origine locale
  parcelles_geojson jsonb,
  batiments_geojson jsonb,
  ortho_path      text,
  -- Emprise de l'orthophoto en mètres relatifs [xmin, ymin, xmax, ymax]
  ortho_emprise   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_conception_projets_updated_at
  BEFORE UPDATE ON conception_projets
  FOR EACH ROW
  EXECUTE FUNCTION maj_updated_at();

ALTER TABLE conception_projets ENABLE ROW LEVEL SECURITY;

-- Bucket privé dédié au module conception
INSERT INTO storage.buckets (id, name, public)
VALUES ('conception', 'conception', false);

COMMIT;
