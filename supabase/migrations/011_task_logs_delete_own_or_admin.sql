drop policy if exists task_logs_delete on public.task_logs;
create policy task_logs_delete
on public.task_logs
for delete
using (
  public.is_community_admin(community_id)
  or (
    member_user_id = auth.uid()
    and public.is_member_of_community(
      community_id,
      array['active']::public.membership_status[]
    )
  )
);
