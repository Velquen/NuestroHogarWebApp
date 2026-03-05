create index if not exists idx_task_logs_community_date_desc
  on public.task_logs (community_id, performed_on desc);

create index if not exists idx_task_logs_member_date_desc
  on public.task_logs (member_user_id, performed_on desc);

create index if not exists idx_task_logs_task_date_desc
  on public.task_logs (task_id, performed_on desc);

create index if not exists idx_community_memberships_community_status
  on public.community_memberships (community_id, status);

create index if not exists idx_community_member_absences_membership_dates
  on public.community_member_absences (membership_id, absent_from, absent_to);

create index if not exists idx_community_tasks_community_active
  on public.community_tasks (community_id, is_active);
