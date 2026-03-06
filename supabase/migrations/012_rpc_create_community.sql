create or replace function public.rpc_create_community(p_name text)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'No hay sesión activa en Supabase';
  end if;

  v_name := nullif(trim(p_name), '');

  if v_name is null then
    raise exception 'Escribe un nombre para la comunidad.';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'El nombre de la comunidad debe tener al menos 3 caracteres.';
  end if;

  if char_length(v_name) > 64 then
    raise exception 'El nombre de la comunidad no puede superar 64 caracteres.';
  end if;

  return query
  insert into public.communities (name, created_by)
  values (v_name, v_user_id)
  returning communities.id, communities.name;
end;
$$;

grant execute on function public.rpc_create_community(text) to authenticated;
