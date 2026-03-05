import { getSupabaseClient } from '../lib/supabase';

export interface CommunityTask {
  id: string;
  name: string;
  category: string;
  score: number;
  createdAt: string;
}

export interface RecentTaskLog {
  id: string;
  taskName: string;
  categoryName: string;
  performedOn: string;
  scoreSnapshot: number;
  pointsTotal: number;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface TaskRow {
  id: string;
  name: string;
  score: number;
  created_at: string;
  task_categories:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
}

interface TaskLogRow {
  id: string;
  performed_on: string;
  score_snapshot: number;
  points_total: number;
  community_tasks:
    | {
        name: string;
        task_categories:
          | {
              name: string;
            }
          | {
              name: string;
            }[]
          | null;
      }
    | {
        name: string;
        task_categories:
          | {
              name: string;
            }
          | {
              name: string;
            }[]
          | null;
      }[]
    | null;
}

function toTask(row: TaskRow): CommunityTask {
  const category = Array.isArray(row.task_categories)
    ? (row.task_categories[0]?.name ?? 'General')
    : (row.task_categories?.name ?? 'General');

  return {
    id: row.id,
    name: row.name,
    category,
    score: Number(row.score),
    createdAt: row.created_at.slice(0, 10),
  };
}

function toRecentTaskLog(row: TaskLogRow): RecentTaskLog {
  const task = Array.isArray(row.community_tasks) ? row.community_tasks[0] : row.community_tasks;
  const categorySource = task?.task_categories;
  const categoryName = Array.isArray(categorySource)
    ? (categorySource[0]?.name ?? 'General')
    : (categorySource?.name ?? 'General');

  return {
    id: row.id,
    taskName: task?.name ?? 'Actividad',
    categoryName,
    performedOn: row.performed_on,
    scoreSnapshot: Number(row.score_snapshot ?? 0),
    pointsTotal: Number(row.points_total ?? 0),
  };
}

async function getCurrentUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`No se pudo obtener el usuario autenticado: ${error.message}`);
  }

  if (!user) {
    throw new Error('No hay sesión activa en Supabase');
  }

  return user.id;
}

export async function fetchTaskCategories(communityId: string): Promise<string[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('task_categories')
    .select('name')
    .eq('community_id', communityId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar categorías: ${error.message}`);
  }

  return (data ?? []).map((row) => row.name);
}

export async function fetchCommunityTasks(communityId: string): Promise<CommunityTask[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('community_tasks')
    .select('id, name, score, created_at, task_categories(name)')
    .eq('community_id', communityId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .returns<TaskRow[]>();

  if (error) {
    throw new Error(`No se pudieron cargar tareas: ${error.message}`);
  }

  return (data ?? []).map(toTask);
}

export async function fetchMyRecentTaskLogs(
  communityId: string,
  limit = 5,
): Promise<RecentTaskLog[]> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();

  const safeLimit = Math.min(15, Math.max(1, Math.floor(limit)));
  const { data, error } = await supabase
    .from('task_logs')
    .select(
      'id, performed_on, score_snapshot, points_total, community_tasks(name, task_categories(name))',
    )
    .eq('community_id', communityId)
    .eq('member_user_id', userId)
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit)
    .returns<TaskLogRow[]>();

  if (error) {
    throw new Error(`No se pudieron cargar tus últimos registros: ${error.message}`);
  }

  return (data ?? []).map(toRecentTaskLog);
}

export async function createTaskCategory(communityId: string, categoryName: string): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase.from('task_categories').insert({
    community_id: communityId,
    name: categoryName,
    created_by: userId,
  });

  if (error) {
    throw new Error(`No se pudo crear la categoría: ${error.message}`);
  }
}

async function getOrCreateCategoryId(communityId: string, categoryName: string): Promise<string> {
  const supabase = getSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from('task_categories')
    .select('id, name')
    .eq('community_id', communityId)
    .ilike('name', categoryName)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`No se pudo consultar la categoría: ${selectError.message}`);
  }

  const typedExisting = existing as CategoryRow | null;

  if (typedExisting) {
    return typedExisting.id;
  }

  await createTaskCategory(communityId, categoryName);

  const { data: created, error: fetchError } = await supabase
    .from('task_categories')
    .select('id, name')
    .eq('community_id', communityId)
    .ilike('name', categoryName)
    .limit(1)
    .single();

  if (fetchError) {
    throw new Error(`No se pudo recuperar la categoría recién creada: ${fetchError.message}`);
  }

  return (created as CategoryRow).id;
}

export async function createCommunityTask(params: {
  communityId: string;
  name: string;
  categoryName: string;
  score: number;
}): Promise<void> {
  const { communityId, name, categoryName, score } = params;
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();
  const categoryId = await getOrCreateCategoryId(communityId, categoryName);

  const { error } = await supabase.from('community_tasks').insert({
    community_id: communityId,
    category_id: categoryId,
    name,
    score,
    created_by: userId,
  });

  if (error) {
    throw new Error(`No se pudo crear la tarea: ${error.message}`);
  }
}

export async function deactivateCommunityTask(taskId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('community_tasks')
    .update({ is_active: false })
    .eq('id', taskId);

  if (error) {
    throw new Error(`No se pudo desactivar la tarea: ${error.message}`);
  }
}

export async function createTaskLog(
  taskId: string,
  communityId: string,
  performedOn: string,
  quantity = 1,
): Promise<string> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('task_logs')
    .insert({
      community_id: communityId,
      task_id: taskId,
      member_user_id: userId,
      performed_on: performedOn,
      quantity,
    })
    .select('id')
    .single()
    .returns<{ id: string }>();

  if (error) {
    throw new Error(`No se pudo registrar la tarea: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('No se pudo recuperar el identificador del registro creado.');
  }

  return data.id;
}

export async function deleteTaskLog(taskLogId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('task_logs').delete().eq('id', taskLogId);

  if (error) {
    throw new Error(`No se pudo eliminar el registro: ${error.message}`);
  }
}
