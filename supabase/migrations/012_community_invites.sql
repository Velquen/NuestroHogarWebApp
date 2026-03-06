create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_invites_token_min_length check (char_length(token) >= 16),
  constraint community_invites_expires_future check (expires_at > created_at)
);

create index if not exists idx_community_invites_community_id
  on public.community_invites (community_id);

create index if not exists idx_community_invites_expires_at
  on public.community_invites (expires_at);

create index if not exists idx_community_invites_created_by
  on public.community_invites (created_by);

drop trigger if exists trg_community_invites_set_updated_at on public.community_invites;
create trigger trg_community_invites_set_updated_at
before update on public.community_invites
for each row
execute function public.set_updated_at();

alter table public.community_invites enable row level security;

drop policy if exists community_invites_select on public.community_invites;
create policy community_invites_select
on public.community_invites
for select
using (public.is_community_admin(community_id));

drop policy if exists community_invites_insert on public.community_invites;
create policy community_invites_insert
on public.community_invites
for insert
with check (
  created_by = (select auth.uid())
  and public.is_community_admin(community_id)
);

drop policy if exists community_invites_update on public.community_invites;
create policy community_invites_update
on public.community_invites
for update
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists community_invites_delete on public.community_invites;
create policy community_invites_delete
on public.community_invites
for delete
using (public.is_community_admin(community_id));

create or replace function public.rpc_create_community_invite(
  p_community_id uuid,
  p_expires_in_hours integer default 168
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
  v_hours integer;
  v_token text;
  v_expires_at timestamptz;
begin
  if p_community_id is null then
    raise exception 'p_community_id es obligatorio';
  end if;

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para invitar integrantes';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'No autorizado para invitar a esta comunidad';
  end if;

  v_hours := greatest(1, least(coalesce(p_expires_in_hours, 168), 720));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at := now() + make_interval(hours => v_hours);

  insert into public.community_invites (community_id, token, created_by, expires_at)
  values (p_community_id, v_token, auth.uid(), v_expires_at);

  return query
  select v_token, v_expires_at, p_community_id;
end;
$$;

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
  on conflict (community_id, user_id)
  do update
    set status = 'active',
        left_at = null,
        updated_at = now();

  return query
  select 'joined'::text, v_invite.community_id, v_invite.community_name;
end;
$$;

grant execute on function public.rpc_create_community_invite(uuid, integer) to authenticated;
grant execute on function public.rpc_accept_community_invite(text) to authenticated;
