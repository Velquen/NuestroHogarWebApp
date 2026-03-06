create or replace function public.rpc_create_community_invite(
  p_community_id uuid,
  p_expires_in_hours integer default 30
)
returns table (
  token text,
  expires_at timestamptz,
  community_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_token text;
  v_expires_at timestamptz;
begin
  -- p_expires_in_hours se mantiene por compatibilidad de firma; aquí representa minutos.
  if p_community_id is null then
    raise exception 'p_community_id es obligatorio';
  end if;

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para invitar integrantes';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'No autorizado para invitar a esta comunidad';
  end if;

  v_minutes := greatest(1, least(coalesce(p_expires_in_hours, 30), 1440));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at := now() + make_interval(mins => v_minutes);

  insert into public.community_invites (community_id, token, created_by, expires_at)
  values (p_community_id, v_token, auth.uid(), v_expires_at);

  return query
  select v_token, v_expires_at, p_community_id;
end;
$$;

grant execute on function public.rpc_create_community_invite(uuid, integer) to authenticated;
