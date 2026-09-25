-- ============================================================
-- Migration initiale — Atelier des Prés
-- ============================================================

-- ---------- Enums ----------

CREATE TYPE budget_declare AS ENUM (
  'moins_5k', '5k_15k', '15k_40k', 'plus_40k', 'ne_sait_pas'
);

CREATE TYPE urgence AS ENUM (
  'moins_3_mois', '3_6_mois', '6_12_mois', 'plus_12_mois'
);

CREATE TYPE categorie_lead AS ENUM ('A', 'B', 'C', 'D');

CREATE TYPE statut_lead AS ENUM (
  'nouveau', 'contacte', 'diagnostic', 'conception', 'signe', 'perdu'
);

-- ---------- Tables ----------

CREATE TABLE landing_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  titre       text NOT NULL,
  sous_titre  text,
  contenu     jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Contact
  prenom                text,
  email                 text,
  telephone             text,

  -- Localisation
  adresse_label         text,
  lat                   double precision,
  lon                   double precision,
  code_insee            text,
  parcelle_geojson      jsonb,
  surface_parcelle      double precision,
  image_aerienne_path   text,

  -- Projet
  types_amenagement     text[],
  surface_projet        double precision,
  description           text,
  budget_declare        budget_declare,
  urgence               urgence,
  proprietaire          boolean,
  rappel_souhaite       boolean,
  creneau_rappel        text,

  -- Estimation
  fourchette_min        integer,
  fourchette_max        integer,
  analyse_ia            jsonb,

  -- Scoring
  score_valeur          integer,
  score_chaleur         integer,
  categorie             categorie_lead,
  statut                statut_lead NOT NULL DEFAULT 'nouveau',
  etape_atteinte        integer NOT NULL DEFAULT 1,

  -- RGPD
  consentement_rgpd     boolean,
  consentement_date     timestamptz,

  -- Acquisition
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  page_arrivee          text,
  landing_page_id       uuid REFERENCES landing_pages(id)
);

CREATE TABLE photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  path              text NOT NULL,
  lat               double precision,
  lon               double precision,
  orientation_degres double precision,
  ordre             integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tarifs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_amenagement  text NOT NULL UNIQUE,
  prix_m2_min       numeric,
  prix_m2_max       numeric,
  forfait_minimum   numeric
);

-- ---------- Trigger updated_at ----------

CREATE OR REPLACE FUNCTION maj_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION maj_updated_at();

-- ---------- Row Level Security ----------

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifs         ENABLE ROW LEVEL SECURITY;

-- Aucune politique publique : tout passe par la clé service_role.

-- ---------- Buckets Storage ----------

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('photos-jardins',   'photos-jardins',   false),
  ('documents-leads',  'documents-leads',  false);
