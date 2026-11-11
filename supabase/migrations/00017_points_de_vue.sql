-- Points de vue photo pour le calage caméra à l'étape 5.

CREATE TABLE conception_points_de_vue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id    uuid NOT NULL REFERENCES conception_projets(id) ON DELETE CASCADE,
  zone_id      uuid REFERENCES conception_elements(id) ON DELETE SET NULL,
  nom          text NOT NULL DEFAULT 'Vue',
  photo_path   text NOT NULL,
  largeur_px   integer NOT NULL,
  hauteur_px   integer NOT NULL,
  exif         jsonb NOT NULL DEFAULT '{}',
  camera       jsonb NOT NULL DEFAULT '{}',
  soleil       jsonb NOT NULL DEFAULT '{"azimut":180,"elevation":45}',
  statut       text NOT NULL DEFAULT 'a_caler' CHECK (statut IN ('a_caler','cale')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conception_points_de_vue_projet
  ON conception_points_de_vue(projet_id);

CREATE TRIGGER trg_conception_points_de_vue_updated_at
  BEFORE UPDATE ON conception_points_de_vue
  FOR EACH ROW
  EXECUTE FUNCTION maj_updated_at();

ALTER TABLE conception_points_de_vue ENABLE ROW LEVEL SECURITY;
