-- Rendus IA des vues photo (étape 6 du module conception).
-- Fichiers dans le bucket "conception" : projets/{projet}/rendus/{rendu}/image.png
-- (et masque.png pour le style réaliste).

CREATE TABLE conception_rendus (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_de_vue_id  uuid NOT NULL REFERENCES conception_points_de_vue(id) ON DELETE CASCADE,
  style            text NOT NULL CHECK (style IN ('realiste', 'dessin_filtre', 'dessin_ia')),
  image_path       text NOT NULL,
  masque_path      text,
  cout             numeric(10, 4) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conception_rendus_point_de_vue
  ON conception_rendus(point_de_vue_id);

-- RLS activé, aucune politique publique : accès uniquement par le client service_role
-- des routes API, après exigerAdmin().
ALTER TABLE conception_rendus ENABLE ROW LEVEL SECURITY;
