create index if not exists idx_communities_created_by
  on public.communities (created_by);

create index if not exists idx_community_member_absences_created_by
  on public.community_member_absences (created_by);

create index if not exists idx_community_memberships_user_id
  on public.community_memberships (user_id);

create index if not exists idx_community_tasks_category_community
  on public.community_tasks (category_id, community_id);

create index if not exists idx_community_tasks_created_by
  on public.community_tasks (created_by);

create index if not exists idx_task_categories_created_by
  on public.task_categories (created_by);

create index if not exists idx_task_logs_task_community
  on public.task_logs (task_id, community_id);

grant select on public.v_community_presence_today to authenticated;
grant select on public.v_weekly_member_metrics to authenticated;
grant execute on function public.rpc_community_presence(uuid, date) to authenticated;
grant execute on function public.rpc_community_metrics(uuid, date, date) to authenticated;
