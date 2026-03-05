create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create unique index if not exists ux_task_categories_community_lower_name
on public.task_categories (community_id, lower(name));

alter table public.task_categories
  add constraint task_categories_id_community_unique unique (id, community_id);

create table if not exists public.community_tasks (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  score smallint not null check (score between 2 and 7),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_tasks_category_fk
    foreign key (category_id, community_id)
    references public.task_categories (id, community_id)
    on delete restrict
);

create trigger trg_community_tasks_set_updated_at
before update on public.community_tasks
for each row
execute function public.set_updated_at();

create unique index if not exists ux_community_tasks_community_lower_name
on public.community_tasks (community_id, lower(name));

alter table public.community_tasks
  add constraint community_tasks_id_community_unique unique (id, community_id);

create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  task_id uuid not null,
  member_user_id uuid not null references public.profiles(user_id) on delete restrict,
  performed_on date not null,
  quantity integer not null default 1 check (quantity between 1 and 100),
  score_snapshot smallint not null check (score_snapshot between 2 and 7),
  points_total integer generated always as (quantity * score_snapshot) stored,
  created_at timestamptz not null default now(),
  constraint task_logs_task_fk
    foreign key (task_id, community_id)
    references public.community_tasks (id, community_id)
    on delete restrict,
  constraint task_logs_no_future check (performed_on <= current_date)
);

create or replace function public.set_task_log_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
begin
  if new.member_user_id is null then
    new.member_user_id := auth.uid();
  end if;

  if new.member_user_id is distinct from auth.uid() then
    raise exception 'Solo puedes registrar tareas para tu propio usuario';
  end if;

  select t.community_id, t.score, t.is_active
    into v_task
  from public.community_tasks t
  where t.id = new.task_id;

  if not found then
    raise exception 'La tarea no existe';
  end if;

  if v_task.is_active is false then
    raise exception 'La tarea esta inactiva';
  end if;

  new.community_id := v_task.community_id;
  new.score_snapshot := v_task.score;

  if new.performed_on > current_date then
    raise exception 'No se permiten registros en fechas futuras';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_task_log_snapshot on public.task_logs;
create trigger trg_set_task_log_snapshot
before insert on public.task_logs
for each row
execute function public.set_task_log_snapshot();
