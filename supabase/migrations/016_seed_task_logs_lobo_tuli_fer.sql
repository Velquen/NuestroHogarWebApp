DO $$
DECLARE
  v_lobo uuid;
  v_tuli uuid;
  v_fer uuid;
  v_community_id uuid;
  v_member record;
BEGIN
  SELECT p.user_id
    INTO v_lobo
  FROM public.profiles p
  WHERE lower(coalesce(nullif(trim(p.profile_alias), ''), trim(p.display_name))) = 'lobo'
     OR lower(trim(p.display_name)) = 'lobo'
  ORDER BY p.created_at ASC
  LIMIT 1;

  SELECT p.user_id
    INTO v_tuli
  FROM public.profiles p
  WHERE lower(coalesce(nullif(trim(p.profile_alias), ''), trim(p.display_name))) = 'tuli'
     OR lower(trim(p.display_name)) = 'tuli'
  ORDER BY p.created_at ASC
  LIMIT 1;

  SELECT p.user_id
    INTO v_fer
  FROM public.profiles p
  WHERE lower(coalesce(nullif(trim(p.profile_alias), ''), trim(p.display_name))) = 'fer'
     OR lower(trim(p.display_name)) = 'fer'
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_lobo IS NULL OR v_tuli IS NULL OR v_fer IS NULL THEN
    RAISE EXCEPTION 'Faltan perfiles requeridos para seed. Lobo: %, Tuli: %, Fer: %',
      v_lobo, v_tuli, v_fer;
  END IF;

  SELECT cm.community_id
    INTO v_community_id
  FROM public.community_memberships cm
  WHERE cm.user_id = v_lobo
    AND cm.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.community_memberships cm2
      WHERE cm2.community_id = cm.community_id
        AND cm2.user_id = v_tuli
        AND cm2.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_memberships cm3
      WHERE cm3.community_id = cm.community_id
        AND cm3.user_id = v_fer
        AND cm3.status = 'active'
    )
  ORDER BY cm.joined_at ASC
  LIMIT 1;

  IF v_community_id IS NULL THEN
    SELECT cm.community_id
      INTO v_community_id
    FROM public.community_memberships cm
    WHERE cm.user_id = v_lobo
      AND cm.status = 'active'
    ORDER BY cm.joined_at ASC
    LIMIT 1;
  END IF;

  IF v_community_id IS NULL THEN
    INSERT INTO public.communities (name, created_by)
    VALUES ('Nuestro Hogar', v_lobo)
    RETURNING id INTO v_community_id;
  END IF;

  INSERT INTO public.community_memberships (community_id, user_id, role, status)
  VALUES
    (v_community_id, v_lobo, 'owner', 'active'),
    (v_community_id, v_tuli, 'member', 'active'),
    (v_community_id, v_fer, 'member', 'active')
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET
    status = 'active',
    left_at = NULL;

  INSERT INTO public.task_categories (community_id, name, created_by)
  SELECT v_community_id, seed_categories.name, v_lobo
  FROM (
    VALUES ('Cocina'), ('Limpieza'), ('Baño'), ('Lavandería'), ('Compras')
  ) AS seed_categories(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.task_categories tc
    WHERE tc.community_id = v_community_id
      AND lower(tc.name) = lower(seed_categories.name)
  );

  INSERT INTO public.community_tasks (community_id, category_id, name, score, is_active, created_by)
  SELECT
    v_community_id,
    tc.id,
    seed_tasks.name,
    seed_tasks.score,
    true,
    v_lobo
  FROM (
    VALUES
      ('Cocina', 'Lavar platos', 4),
      ('Limpieza', 'Sacar basura', 3),
      ('Baño', 'Limpiar baño', 6),
      ('Limpieza', 'Barrer patio', 5),
      ('Lavandería', 'Poner lavadora', 4),
      ('Lavandería', 'Tender ropa', 3),
      ('Compras', 'Hacer compras', 5),
      ('Limpieza', 'Ordenar living', 4)
  ) AS seed_tasks(category_name, name, score)
  JOIN public.task_categories tc
    ON tc.community_id = v_community_id
   AND lower(tc.name) = lower(seed_tasks.category_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.community_tasks t
    WHERE t.community_id = v_community_id
      AND lower(t.name) = lower(seed_tasks.name)
  );

  CREATE TEMP TABLE tmp_ui_seed_events (
    member_user_id uuid NOT NULL,
    task_name text NOT NULL,
    performed_on date NOT NULL,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_ui_seed_events (member_user_id, task_name, performed_on, quantity)
  SELECT
    v_lobo,
    CASE
      WHEN gs % 5 = 0 THEN 'Hacer compras'
      WHEN gs % 3 = 0 THEN 'Barrer patio'
      ELSE 'Lavar platos'
    END,
    current_date - gs,
    CASE WHEN gs % 7 = 0 THEN 2 ELSE 1 END
  FROM generate_series(1, 28) AS gs
  WHERE gs % 2 = 0

  UNION ALL

  SELECT
    v_tuli,
    CASE
      WHEN gs % 4 = 0 THEN 'Limpiar baño'
      WHEN gs % 3 = 0 THEN 'Tender ropa'
      ELSE 'Sacar basura'
    END,
    current_date - gs,
    CASE WHEN gs % 6 = 0 THEN 2 ELSE 1 END
  FROM generate_series(1, 28) AS gs
  WHERE gs % 2 = 1

  UNION ALL

  SELECT
    v_fer,
    CASE
      WHEN gs % 5 = 0 THEN 'Poner lavadora'
      WHEN gs % 3 = 0 THEN 'Ordenar living'
      ELSE 'Lavar platos'
    END,
    current_date - gs,
    CASE WHEN gs % 8 = 0 THEN 2 ELSE 1 END
  FROM generate_series(1, 24) AS gs;

  FOR v_member IN
    SELECT DISTINCT e.member_user_id
    FROM tmp_ui_seed_events e
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_member.member_user_id::text, true);

    INSERT INTO public.task_logs (task_id, member_user_id, performed_on, quantity)
    SELECT
      t.id,
      e.member_user_id,
      e.performed_on,
      e.quantity
    FROM tmp_ui_seed_events e
    JOIN public.community_tasks t
      ON t.community_id = v_community_id
     AND lower(t.name) = lower(e.task_name)
    WHERE e.member_user_id = v_member.member_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_logs l
        WHERE l.community_id = v_community_id
          AND l.task_id = t.id
          AND l.member_user_id = e.member_user_id
          AND l.performed_on = e.performed_on
          AND l.quantity = e.quantity
      );
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
