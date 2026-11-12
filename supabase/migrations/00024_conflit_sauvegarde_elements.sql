-- Conflit de sauvegarde des éléments : date de référence propre aux éléments.
--
-- Avant : conception_sauvegarder comparait conception_projets.updated_at, que modifient
-- aussi des traitements sans rapport avec les éléments (relief enregistré en arrière-plan
-- quelques secondes après la création du projet, tolérance, parcelle…). Une page ouverte
-- juste après la création gardait une date périmée : chaque sauvegarde suivante était
-- refusée pour « conflit », sans que rien ne soit enregistré.
--
-- Après : la vérification porte sur elements_modifies_le, mise à jour UNIQUEMENT par la
-- sauvegarde des éléments. Un vrai conflit (deux onglets sur le même projet) reste détecté.

BEGIN;

ALTER TABLE conception_projets
  ADD COLUMN IF NOT EXISTS elements_modifies_le timestamptz NOT NULL DEFAULT now();

-- Projets existants : référence = date de création. Un onglet déjà ouvert (dont la date
-- est au moins celle de la création) peut ainsi enregistrer ses modifications en attente,
-- y compris celles refusées à tort jusqu'ici.
UPDATE conception_projets SET elements_modifies_le = created_at;

CREATE OR REPLACE FUNCTION conception_sauvegarder(
  p_projet_id uuid,
  p_upserts jsonb,
  p_suppressions uuid[],
  p_updated_at timestamptz
) RETURNS jsonb AS $$
DECLARE
  v_reference timestamptz;
  v_elem jsonb;
BEGIN
  -- Vérifier le conflit de modification des éléments
  SELECT elements_modifies_le INTO v_reference
  FROM conception_projets WHERE id = p_projet_id;

  IF v_reference IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Projet introuvable.');
  END IF;

  IF v_reference > p_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflit',
      'server_updated_at', v_reference);
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

  -- Nouvelle date de référence des éléments (updated_at suit par le déclencheur)
  UPDATE conception_projets SET elements_modifies_le = now() WHERE id = p_projet_id;

  SELECT elements_modifies_le INTO v_reference FROM conception_projets WHERE id = p_projet_id;

  -- Clé « updated_at » conservée pour la compatibilité avec le navigateur
  RETURN jsonb_build_object('ok', true, 'updated_at', v_reference);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
