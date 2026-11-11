-- Fiche écologique des plantes : exposition, besoin en eau, résistance à la sécheresse.
-- Utilisés par la composition IA (et plus tard le dossier client).

ALTER TABLE plantes
  ADD COLUMN IF NOT EXISTS exposition text[]
    CHECK (exposition <@ ARRAY['soleil', 'mi_ombre', 'ombre']::text[]),
  ADD COLUMN IF NOT EXISTS besoin_eau text
    CHECK (besoin_eau IN ('faible', 'moyen', 'eleve')),
  ADD COLUMN IF NOT EXISTS resistance_secheresse text
    CHECK (resistance_secheresse IN ('normale', 'elevee', 'tres_elevee'));
