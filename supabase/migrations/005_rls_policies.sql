alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_member_absences enable row level security;
alter table public.task_categories enable row level security;
alter table public.community_tasks enable row level security;
alter table public.task_logs enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.community_memberships me
    join public.community_memberships other
      on other.community_id = me.community_id
    where me.user_id = auth.uid()
      and me.status in ('active', 'invited', 'left')
      and other.user_id = profiles.user_id
  )
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists communities_select on public.communities;
create policy communities_select
on public.communities
for select
using (public.is_member_of_community(id, array['active','invited','left']::public.membership_status[]));

drop policy if exists communities_insert on public.communities;
create policy communities_insert
on public.communities
for insert
with check (created_by = auth.uid());

drop policy if exists communities_update on public.communities;
create policy communities_update
on public.communities
for update
using (public.is_community_admin(id))
with check (public.is_community_admin(id));

drop policy if exists communities_delete on public.communities;
create policy communities_delete
on public.communities
for delete
using (public.is_community_owner(id));

drop policy if exists memberships_select on public.community_memberships;
create policy memberships_select
on public.community_memberships
for select
using (
  public.is_member_of_community(
    community_id,
    array['active','invited','left']::public.membership_status[]
  )
);

drop policy if exists memberships_insert on public.community_memberships;
create policy memberships_insert
on public.community_memberships
for insert
with check (public.is_community_admin(community_id));

drop policy if exists memberships_update on public.community_memberships;
create policy memberships_update
on public.community_memberships
for update
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists memberships_delete on public.community_memberships;
create policy memberships_delete
on public.community_memberships
for delete
using (public.is_community_admin(community_id));

drop policy if exists absences_select on public.community_member_absences;
create policy absences_select
on public.community_member_absences
for select
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.id = community_member_absences.membership_id
      and public.is_member_of_community(
        cm.community_id,
        array['active','invited','left']::public.membership_status[]
      )
  )
);

drop policy if exists absences_insert on public.community_member_absences;
create policy absences_insert
on public.community_member_absences
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.community_memberships cm
    where cm.id = community_member_absences.membership_id
      and (
        (cm.user_id = auth.uid() and cm.status = 'active')
        or public.is_community_admin(cm.community_id)
      )
  )
);

drop policy if exists absences_update on public.community_member_absences;
create policy absences_update
on public.community_member_absences
for update
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.id = community_member_absences.membership_id
      and public.is_community_admin(cm.community_id)
  )
)
with check (
  exists (
    select 1
    from public.community_memberships cm
    where cm.id = community_member_absences.membership_id
      and public.is_community_admin(cm.community_id)
  )
);

drop policy if exists absences_delete on public.community_member_absences;
create policy absences_delete
on public.community_member_absences
for delete
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.id = community_member_absences.membership_id
      and public.is_community_admin(cm.community_id)
  )
);

drop policy if exists task_categories_select on public.task_categories;
create policy task_categories_select
on public.task_categories
for select
using (
  public.is_member_of_community(
    community_id,
    array['active','invited','left']::public.membership_status[]
  )
);

drop policy if exists task_categories_insert on public.task_categories;
create policy task_categories_insert
on public.task_categories
for insert
with check (
  created_by = auth.uid()
  and public.is_community_admin(community_id)
);

drop policy if exists task_categories_update on public.task_categories;
create policy task_categories_update
on public.task_categories
for update
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists task_categories_delete on public.task_categories;
create policy task_categories_delete
on public.task_categories
for delete
using (public.is_community_admin(community_id));

drop policy if exists community_tasks_select on public.community_tasks;
create policy community_tasks_select
on public.community_tasks
for select
using (
  public.is_member_of_community(
    community_id,
    array['active','invited','left']::public.membership_status[]
  )
);

drop policy if exists community_tasks_insert on public.community_tasks;
create policy community_tasks_insert
on public.community_tasks
for insert
with check (
  created_by = auth.uid()
  and public.is_community_admin(community_id)
);

drop policy if exists community_tasks_update on public.community_tasks;
create policy community_tasks_update
on public.community_tasks
for update
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists community_tasks_delete on public.community_tasks;
create policy community_tasks_delete
on public.community_tasks
for delete
using (public.is_community_admin(community_id));

drop policy if exists task_logs_select on public.task_logs;
create policy task_logs_select
on public.task_logs
for select
using (
  public.is_member_of_community(
    community_id,
    array['active','invited','left']::public.membership_status[]
  )
);

drop policy if exists task_logs_insert on public.task_logs;
create policy task_logs_insert
on public.task_logs
for insert
with check (
  auth.uid() = member_user_id
  and exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = task_logs.community_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  )
  and exists (
    select 1
    from public.community_tasks t
    where t.id = task_logs.task_id
      and t.community_id = task_logs.community_id
      and t.is_active = true
  )
  and not exists (
    select 1
    from public.community_memberships cm
    join public.community_member_absences a on a.membership_id = cm.id
    where cm.community_id = task_logs.community_id
      and cm.user_id = auth.uid()
      and task_logs.performed_on between a.absent_from and coalesce(a.absent_to, 'infinity'::date)
  )
);

drop policy if exists task_logs_update on public.task_logs;
create policy task_logs_update
on public.task_logs
for update
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists task_logs_delete on public.task_logs;
create policy task_logs_delete
on public.task_logs
for delete
using (public.is_community_admin(community_id));
