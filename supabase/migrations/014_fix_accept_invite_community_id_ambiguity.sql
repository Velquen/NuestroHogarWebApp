create or replace function public.rpc_accept_community_invite(p_token text)
returns table (
  status text,
  community_id uuid,
  community_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_token text;
  v_invite record;
  v_membership record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Debes iniciar sesión para aceptar la invitación';
  end if;

  v_token := nullif(trim(p_token), '');
  if v_token is null then
    raise exception 'Token de invitación inválido';
  end if;

  select
    ci.community_id,
    c.name as community_name
  into v_invite
  from public.community_invites ci
  join public.communities c on c.id = ci.community_id
  where ci.token = v_token
    and ci.revoked_at is null
    and ci.expires_at > now()
  order by ci.created_at desc
  limit 1;

  if not found then
    raise exception 'Invitación inválida o expirada';
  end if;

  select cm.id, cm.status
  into v_membership
  from public.community_memberships cm
  where cm.community_id = v_invite.community_id
    and cm.user_id = v_user_id
  limit 1;

  if found then
    if v_membership.status = 'active' then
      return query
      select 'already_member'::text, v_invite.community_id, v_invite.community_name;
      return;
    end if;

    update public.community_memberships cm
    set status = 'active',
        left_at = null,
        joined_at = coalesce(cm.joined_at, now()),
        updated_at = now()
    where cm.id = v_membership.id;

    return query
    select 'reactivated'::text, v_invite.community_id, v_invite.community_name;
    return;
  end if;

  insert into public.community_memberships (community_id, user_id, role, status, joined_at, left_at)
  values (v_invite.community_id, v_user_id, 'member', 'active', now(), null)
  on conflict on constraint community_memberships_unique_member
  do update
    set status = 'active',
        left_at = null,
        updated_at = now();

  return query
  select 'joined'::text, v_invite.community_id, v_invite.community_name;
end;
$$;
