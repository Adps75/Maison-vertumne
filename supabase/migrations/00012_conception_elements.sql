-- ============================================================
-- Migration 00012 — Éléments de conception et RPC de sauvegarde
-- ============================================================

BEGIN;

CREATE TABLE conception_elements (
  id          uuid PRIMARY KEY,
  projet_id   uuid NOT NULL REFERENCES conception_projets(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('sol','mineral','vegetal','bati','limite','cote','annotation')),
  geometrie   jsonb NOT NULL,
  calque      text NOT NULL DEFAULT 'defaut',
  statut      text NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('existant','conserve','nouveau','supprime')),
  hauteur     double precision,
  proprietes  jsonb,
  ordre       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_conception_elements_updated_at
  BEFORE UPDATE ON conception_elements
  FOR EACH ROW
  EXECUTE FUNCTION maj_updated_at();

ALTER TABLE conception_elements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_conception_elements_projet ON conception_elements (projet_id);

-- RPC : sauvegarde différentielle en une transaction
-- p_upserts : tableau JSON d'éléments à insérer/modifier
-- p_suppressions : tableau d'UUID à supprimer
-- p_projet_id : id du projet (vérification)
-- p_updated_at : timestamp de dernière modification connue (détection conflit)
CREATE OR REPLACE FUNCTION conception_sauvegarder(
  p_projet_id uuid,
  p_upserts jsonb,
  p_suppressions uuid[],
  p_updated_at timestamptz
) RETURNS jsonb AS $$
DECLARE
  v_projet_updated timestamptz;
  v_elem jsonb;
BEGIN
  -- Vérifier le conflit de modification
  SELECT updated_at INTO v_projet_updated
  FROM conception_projets WHERE id = p_projet_id;

  IF v_projet_updated IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Projet introuvable.');
  END IF;

  IF v_projet_updated > p_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflit',
      'server_updated_at', v_projet_updated);
  END IF;

  -- Suppressions
  IF p_suppressions IS NOT NULL AND array_length(p_suppressions, 1) > 0 THEN
    DELETE FROM conception_elements
    WHERE id = ANY(p_suppressions) AND projet_id = p_projet_id;
  END IF;

  -- Upserts
  IF p_upserts IS NOT NULL THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_upserts) LOOP
      INSERT INTO conception_elements (
        id, projet_id, type, geometrie, calque, statut, hauteur, proprietes, ordre
      ) VALUES (
        (v_elem->>'id')::uuid,
        p_projet_id,
        v_elem->>'type',
        v_elem->'geometrie',
        COALESCE(v_elem->>'calque', 'defaut'),
        COALESCE(v_elem->>'statut', 'nouveau'),
        (v_elem->>'hauteur')::double precision,
        v_elem->'proprietes',
        COALESCE((v_elem->>'ordre')::int, 0)
      )
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        geometrie = EXCLUDED.geometrie,
        calque = EXCLUDED.calque,
        statut = EXCLUDED.statut,
        hauteur = EXCLUDED.hauteur,
        proprietes = EXCLUDED.proprietes,
        ordre = EXCLUDED.ordre;
    END LOOP;
  END IF;

  -- Mettre à jour le timestamp du projet
  UPDATE conception_projets SET updated_at = now() WHERE id = p_projet_id;

  SELECT updated_at INTO v_projet_updated FROM conception_projets WHERE id = p_projet_id;

  RETURN jsonb_build_object('ok', true, 'updated_at', v_projet_updated);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
