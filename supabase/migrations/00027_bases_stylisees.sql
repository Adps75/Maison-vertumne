-- Rendus dessinés (croquis, aquarelle, feutres) : base stylisée + édition masquée.
--
-- La base est la photo d'origine redessinée dans le style, SANS le projet (ni plantes ni
-- matériaux). Elle est générée une fois par (vue, style, références de style) et
-- réutilisée ; le projet est ensuite ajouté par une édition masquée sur cette base.
-- Fichier : projets/{projet}/bases/{base}.png dans le bucket conception.

BEGIN;

CREATE TABLE IF NOT EXISTS conception_bases_stylisees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_de_vue_id   uuid NOT NULL REFERENCES conception_points_de_vue(id) ON DELETE CASCADE,
  style             text NOT NULL CHECK (style IN ('croquis', 'aquarelle', 'feutres')),
  -- Identifiants des références de style utilisées, triés et joints (vide : aucune)
  cle_references    text NOT NULL DEFAULT '',
  image_path        text NOT NULL,
  consigne          text,
  cout              numeric(10, 4) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (point_de_vue_id, style, cle_references)
);

ALTER TABLE conception_bases_stylisees ENABLE ROW LEVEL SECURITY;

ALTER TABLE conception_rendus
  ADD COLUMN IF NOT EXISTS base_id uuid REFERENCES conception_bases_stylisees(id) ON DELETE SET NULL;

COMMIT;
