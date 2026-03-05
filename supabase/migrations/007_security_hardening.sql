create schema if not exists extensions;

alter function public.set_updated_at() set search_path = public;

alter view public.v_community_presence_today set (security_invoker = true);
alter view public.v_weekly_member_metrics set (security_invoker = true);

DO $$
BEGIN
  BEGIN
    alter extension btree_gist set schema extensions;
  EXCEPTION
    WHEN others THEN
      RAISE NOTICE 'No se pudo mover extension btree_gist al schema extensions: %', SQLERRM;
  END;
END
$$;
