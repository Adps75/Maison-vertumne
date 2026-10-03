-- ============================================================
-- Migration 00013 — Bibliothèque végétale
-- ============================================================

BEGIN;

CREATE TABLE plantes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_commun           text NOT NULL,
  nom_latin            text NOT NULL,
  categorie            text NOT NULL CHECK (categorie IN (
    'arbre','arbuste','vivace','graminee','couvre_sol','grimpante'
  )),
  largeur_adulte_m     double precision,
  hauteur_adulte_m     double precision,
  forme                text CHECK (forme IN (
    'boule','colonne','etalee','retombante','touffe','tige'
  )),
  feuillage            text CHECK (feuillage IN ('persistant','caduc')),
  couleur_feuillage    text,
  couleur_floraison    text,
  periode_floraison    text,
  notes                text,
  image_face_path      text,
  image_dessus_path    text,
  statut               text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','validee')),
  style_version        integer NOT NULL DEFAULT 1,
  est_reference        boolean NOT NULL DEFAULT false,
  cout_generation_total double precision NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Unicité insensible à la casse sur le nom latin normalisé
CREATE UNIQUE INDEX idx_plantes_nom_latin_unique
  ON plantes (lower(trim(nom_latin)));

CREATE TRIGGER trg_plantes_updated_at
  BEFORE UPDATE ON plantes
  FOR EACH ROW
  EXECUTE FUNCTION maj_updated_at();

ALTER TABLE plantes ENABLE ROW LEVEL SECURITY;

COMMIT;
