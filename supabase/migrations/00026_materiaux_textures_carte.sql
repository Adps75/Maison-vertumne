-- Matériaux rendus en 3D avant le rendu IA, et carte des matériaux.
--
-- 1. materiaux : texture répétable (image dans le bucket conception, sous
--    materiaux/{id}/texture.jpg), sa taille réelle en mètres, et la hauteur hors sol
--    des matériaux linéaires (volige, bordure).
-- 2. conception_rendus : carte des matériaux envoyée au modèle (trace), et nombre de
--    passes par matériau.

BEGIN;

ALTER TABLE materiaux
  ADD COLUMN IF NOT EXISTS texture_path text,
  ADD COLUMN IF NOT EXISTS texture_taille_m numeric(5, 2),
  ADD COLUMN IF NOT EXISTS hauteur_m numeric(5, 3);

UPDATE materiaux SET hauteur_m = 0.05 WHERE nom = 'Volige acier' AND hauteur_m IS NULL;
UPDATE materiaux SET hauteur_m = 0.08 WHERE nom = 'Bordure pierre' AND hauteur_m IS NULL;
UPDATE materiaux SET texture_taille_m = 0.6 WHERE nom = 'Paillage écorce de pin' AND texture_taille_m IS NULL;
UPDATE materiaux SET texture_taille_m = 0.5 WHERE nom = 'Paillage minéral' AND texture_taille_m IS NULL;
UPDATE materiaux SET texture_taille_m = 1.0 WHERE nom = 'Gazon (rénovation)' AND texture_taille_m IS NULL;
UPDATE materiaux SET texture_taille_m = 0.5 WHERE nom = 'Gravier' AND texture_taille_m IS NULL;

ALTER TABLE conception_rendus
  ADD COLUMN IF NOT EXISTS carte_path text,
  ADD COLUMN IF NOT EXISTS passes_materiaux integer NOT NULL DEFAULT 0;

COMMIT;
