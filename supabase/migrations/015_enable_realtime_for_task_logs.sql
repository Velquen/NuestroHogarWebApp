do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_logs'
  ) then
    alter publication supabase_realtime add table public.task_logs;
  end if;
end;
$$;
