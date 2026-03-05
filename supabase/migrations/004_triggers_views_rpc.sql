create or replace function public.is_member_of_community(
  p_community_id uuid,
  p_statuses public.membership_status[] default array['active','invited']::public.membership_status[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.status = any(p_statuses)
  );
$$;

create or replace function public.is_community_admin(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_community_owner(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role = 'owner'
  );
$$;

create or replace function public.is_user_absent_on_date(
  p_community_id uuid,
  p_user_id uuid,
  p_on_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    join public.community_member_absences a on a.membership_id = cm.id
    where cm.community_id = p_community_id
      and cm.user_id = p_user_id
      and p_on_date between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
  );
$$;

create or replace view public.v_community_presence_today as
with member_flags as (
  select
    cm.community_id,
    cm.user_id,
    exists (
      select 1
      from public.community_member_absences a
      where a.membership_id = cm.id
        and current_date between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
    ) as is_away
  from public.community_memberships cm
  where cm.status = 'active'
)
select
  community_id,
  count(*)::bigint as active_members_count,
  count(*) filter (where is_away)::bigint as away_today_count,
  count(*) filter (where not is_away)::bigint as present_today_count
from member_flags
group by community_id;

create or replace view public.v_weekly_member_metrics as
select
  l.community_id,
  l.member_user_id,
  date_trunc('week', l.performed_on::timestamp)::date as week_start,
  sum(l.quantity)::bigint as tasks_count,
  sum(l.points_total)::bigint as points_count
from public.task_logs l
join public.community_memberships cm
  on cm.community_id = l.community_id
 and cm.user_id = l.member_user_id
 and cm.status = 'active'
left join public.community_member_absences a
  on a.membership_id = cm.id
 and l.performed_on between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
where l.performed_on between current_date - 6 and current_date
  and a.id is null
group by l.community_id, l.member_user_id, date_trunc('week', l.performed_on::timestamp)::date;

create or replace function public.rpc_community_presence(
  p_community_id uuid,
  p_date date default current_date
)
returns table (
  community_id uuid,
  metric_date date,
  active_members_count bigint,
  away_count bigint,
  present_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_member_of_community(p_community_id, array['active','invited','left']::public.membership_status[]) then
    raise exception 'No autorizado para consultar esta comunidad';
  end if;

  return query
  with member_flags as (
    select
      cm.community_id,
      exists (
        select 1
        from public.community_member_absences a
        where a.membership_id = cm.id
          and p_date between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
      ) as is_away
    from public.community_memberships cm
    where cm.community_id = p_community_id
      and cm.status = 'active'
  )
  select
    p_community_id,
    p_date,
    count(*)::bigint,
    count(*) filter (where is_away)::bigint,
    count(*) filter (where not is_away)::bigint
  from member_flags;
end;
$$;

create or replace function public.rpc_community_metrics(
  p_community_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  metric_date date,
  member_user_id uuid,
  tasks_count bigint,
  points_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'p_start_date y p_end_date son obligatorios';
  end if;

  if p_start_date > p_end_date then
    raise exception 'p_start_date no puede ser mayor que p_end_date';
  end if;

  if not public.is_member_of_community(p_community_id, array['active','invited','left']::public.membership_status[]) then
    raise exception 'No autorizado para consultar esta comunidad';
  end if;

  return query
  select
    l.performed_on as metric_date,
    l.member_user_id,
    sum(l.quantity)::bigint as tasks_count,
    sum(l.points_total)::bigint as points_count
  from public.task_logs l
  join public.community_memberships cm
    on cm.community_id = l.community_id
   and cm.user_id = l.member_user_id
   and cm.status = 'active'
  left join public.community_member_absences a
    on a.membership_id = cm.id
   and l.performed_on between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
  where l.community_id = p_community_id
    and l.performed_on between p_start_date and p_end_date
    and a.id is null
  group by l.performed_on, l.member_user_id
  order by l.performed_on asc, l.member_user_id asc;
end;
$$;
