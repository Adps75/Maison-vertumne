-- Largeur à 3 ans pour le calcul d'écartement entre végétaux.
-- Par défaut null ; le code utilise 70 % de la largeur adulte quand non renseigné.
ALTER TABLE plantes
  ADD COLUMN IF NOT EXISTS largeur_3ans_m real;

-- Tolérance par défaut du projet : 30 % (pas 15 %)
ALTER TABLE conception_projets
  ALTER COLUMN tolerance_chevauchement SET DEFAULT 0.30;
