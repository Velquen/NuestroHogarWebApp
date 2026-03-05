DO $$
DECLARE
  v_owner uuid;
  v_community_id uuid;
BEGIN
  SELECT p.user_id
    INTO v_owner
  FROM public.profiles p
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'No hay perfiles disponibles para crear seed';
  END IF;

  SELECT c.id
    INTO v_community_id
  FROM public.communities c
  WHERE c.created_by = v_owner
    AND lower(c.name) = lower('Nuestro Hogar')
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_community_id IS NULL THEN
    INSERT INTO public.communities (name, created_by)
    VALUES ('Nuestro Hogar', v_owner)
    RETURNING id INTO v_community_id;
  END IF;

  INSERT INTO public.community_memberships (community_id, user_id, role, status)
  VALUES (v_community_id, v_owner, 'owner', 'active')
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    left_at = NULL;

  INSERT INTO public.task_categories (community_id, name, created_by)
  SELECT v_community_id, seed_categories.name, v_owner
  FROM (
    VALUES ('Cocina'), ('Limpieza'), ('Baño')
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
    v_owner
  FROM (
    VALUES
      ('Cocina', 'Lavar platos', 4),
      ('Limpieza', 'Sacar basura', 3),
      ('Baño', 'Limpiar baño', 6)
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
END $$;
