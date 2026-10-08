-- Topographie : altitude de référence et grille de relief sur les projets,
-- type point_cote pour les éléments.

ALTER TABLE conception_projets
  ADD COLUMN IF NOT EXISTS altitude_reference_ngf double precision,
  ADD COLUMN IF NOT EXISTS relief_path text;

ALTER TABLE conception_elements
  DROP CONSTRAINT IF EXISTS conception_elements_type_check;

ALTER TABLE conception_elements
  ADD CONSTRAINT conception_elements_type_check
  CHECK (type IN (
    'sol','mineral','vegetal','bati','limite','cote',
    'annotation','zone','point_cote'
  ));
