create extension if not exists btree_gist;

create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.community_role not null default 'member',
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_memberships_unique_member unique (community_id, user_id),
  constraint community_memberships_left_requires_left_at check (
    (status = 'left' and left_at is not null)
    or
    (status <> 'left')
  )
);

create trigger trg_community_memberships_set_updated_at
before update on public.community_memberships
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_memberships (community_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'active')
  on conflict (community_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_community_created on public.communities;
create trigger trg_on_community_created
after insert on public.communities
for each row
execute function public.handle_new_community();

insert into public.community_memberships (community_id, user_id, role, status)
select c.id, c.created_by, 'owner'::public.community_role, 'active'::public.membership_status
from public.communities c
on conflict (community_id, user_id) do nothing;

create table if not exists public.community_member_absences (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.community_memberships(id) on delete cascade,
  absent_from date not null,
  absent_to date,
  reason text,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  constraint community_member_absences_valid_range check (
    absent_to is null or absent_to >= absent_from
  ),
  constraint community_member_absences_no_overlap
    exclude using gist (
      membership_id with =,
      daterange(absent_from, coalesce(absent_to + 1, 'infinity'::date), '[)') with &&
    )
);
