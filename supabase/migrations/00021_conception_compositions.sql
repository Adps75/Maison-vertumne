-- Compositions de massif par l'IA (module conception).
-- L'IA choisit la palette et l'intention ; un algorithme déterministe place les plantes
-- (graine). Les plantes posées portent proprietes.composition_id.

CREATE TABLE conception_compositions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id   uuid NOT NULL REFERENCES conception_projets(id) ON DELETE CASCADE,
  zone_id     uuid,            -- élément contour (zone ou surface) ; pas de clé étrangère : l'élément peut être supprimé
  brief       jsonb NOT NULL DEFAULT '{}',
  contexte    jsonb NOT NULL DEFAULT '{}',
  palette     jsonb,
  intention   jsonb,
  graine      integer NOT NULL DEFAULT 1,
  modele      text,
  cout        numeric(10, 4) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conception_compositions_projet ON conception_compositions(projet_id);

-- RLS activé, aucune politique publique (accès par les routes API après exigerAdmin()).
ALTER TABLE conception_compositions ENABLE ROW LEVEL SECURITY;
