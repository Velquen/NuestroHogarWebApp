import { getSupabaseClient } from '../lib/supabase';
import type {
  ActivityRange,
  CommunityDashboardData,
  CommunityRoleKey,
  Member,
  RecentCommunityActivity,
  TopTaskMetric,
  WeeklyActivity,
} from '../types/community';

interface MembershipRow {
  community_id: string;
  role: CommunityRoleKey;
  communities: {
    name: string;
  } | null;
}

interface MemberRow {
  user_id: string;
  role: CommunityRoleKey;
  profiles: {
    display_name: string;
    profile_alias: string | null;
    avatar_color: string | null;
    avatar_icon_key: string | null;
  } | null;
}

interface MetricsRow {
  metric_date: string;
  member_user_id: string;
  tasks_count: number;
  points_count: number;
}

interface PresenceRow {
  community_id: string;
  metric_date: string;
  active_members_count: number;
  away_count: number;
  present_count: number;
}

interface PeriodTaskLogRow {
  id: string;
  task_id: string;
  member_user_id: string;
  performed_on: string;
  quantity: number;
  points_total: number;
  created_at: string;
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

const PERIOD_TASK_LOGS_PAGE_SIZE = 1000;

interface CreateCommunityInviteRow {
  token: string;
  expires_at: string;
  community_id: string;
}

interface AcceptCommunityInviteRow {
  status: 'joined' | 'already_member' | 'reactivated';
  community_id: string;
  community_name: string;
}

export interface CommunityInviteLinkData {
  token: string;
  inviteLink: string;
  expiresAt: string;
}

export interface AcceptCommunityInviteResult {
  status: 'joined' | 'already_member' | 'reactivated';
  communityId: string;
  communityName: string;
}

const fallbackPalette = ['#b65f36', '#778a4f', '#ba8f34', '#5f7eb8', '#8f4db1', '#5b8c6d'];

const weekdayMap: Record<string, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const roleLabels: Record<CommunityRoleKey, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Integrante',
};

function toIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  const day = normalized.getDay();
  const mondayOffset = (day + 6) % 7;
  return addDays(normalized, -mondayOffset);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function atMidday(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function toSpanishDayLabel(date: Date): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date).toLowerCase();
  return weekdayMap[day] ?? 'Lunes';
}

function toShortSpanishDate(date: Date): string {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit' }).format(date);
}

function toSpanishMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(date);
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }

  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function toWeekRangeLabel(start: Date, end: Date): string {
  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthName = capitalizeFirst(
    new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(end),
  );

  return `${startDay}-${endDay} ${monthName}`;
}

function toWeekDayWithNumber(date: Date): string {
  const shortDay = new Intl.DateTimeFormat('es-CL', { weekday: 'short' })
    .format(date)
    .replace('.', '');
  const normalizedShortDay = shortDay.slice(0, 1).toUpperCase() + shortDay.slice(1);
  const dayNumber = String(date.getDate()).padStart(2, '0');
  return `${normalizedShortDay} ${dayNumber}`;
}

function shiftRange(start: Date, end: Date) {
  const rangeLengthDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(rangeLengthDays - 1));
  return {
    previousStart,
    previousEnd,
    rangeLengthDays,
  };
}

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / previous) * 100;
}

function getPreviousRangeLabel(activityRange: ActivityRange): string {
  return activityRange === 'week' ? 'vs semana anterior' : 'vs periodo anterior';
}

function resolveActivityRange(range: ActivityRange, today: Date) {
  const todayMidday = atMidday(today);

  if (range === 'week') {
    const start = startOfWeekMonday(todayMidday);
    const end = addDays(start, 6);
    return {
      rangeLabel: toWeekRangeLabel(start, end),
      start,
      end,
      monthLabel: toSpanishMonthLabel(todayMidday),
    };
  }

  if (range === 'month') {
    return {
      rangeLabel: 'Mes actual',
      start: startOfMonth(todayMidday),
      end: todayMidday,
      monthLabel: toSpanishMonthLabel(todayMidday),
    };
  }

  return {
    rangeLabel: 'Mes actual',
    start: startOfMonth(todayMidday),
    end: todayMidday,
    monthLabel: toSpanishMonthLabel(todayMidday),
  };
}

function toInitials(name: string): string {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'NA';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function toMember(row: MemberRow, index: number): Member {
  const baseName = row.profiles?.display_name?.trim() || `Integrante ${index + 1}`;
  const alias = row.profiles?.profile_alias?.trim() || null;
  const displayName = alias ?? baseName;

  return {
    userId: row.user_id,
    baseName,
    alias,
    name: displayName,
    roleKey: row.role,
    role: roleLabels[row.role],
    color: row.profiles?.avatar_color ?? fallbackPalette[index % fallbackPalette.length],
    avatarIconKey: row.profiles?.avatar_icon_key ?? 'leaf_svg',
    initials: toInitials(displayName),
  };
}

function toTaskInfo(
  value: PeriodTaskLogRow['community_tasks'],
): { taskName: string; categoryName: string } {
  const task = Array.isArray(value) ? value[0] : value;
  const categorySource = task?.task_categories;
  const category = Array.isArray(categorySource)
    ? (categorySource[0]?.name ?? 'General')
    : (categorySource?.name ?? 'General');

  return {
    taskName: task?.name ?? 'Actividad',
    categoryName: category,
  };
}

export async function fetchCommunityDashboard(
  preferredCommunityId?: string | null,
  activityRange: ActivityRange = 'week',
): Promise<CommunityDashboardData> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`No se pudo obtener el usuario autenticado: ${authError.message}`);
  }

  if (!user) {
    throw new Error('No hay sesión activa en Supabase');
  }

  const { data: membershipsData, error: membershipsError } = await supabase
    .from('community_memberships')
    .select('community_id, role, communities(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .returns<MembershipRow[]>();

  if (membershipsError) {
    throw new Error(`No se pudieron obtener las comunidades del usuario: ${membershipsError.message}`);
  }

  const memberships = membershipsData ?? [];

  if (memberships.length === 0) {
    throw new Error('El usuario no pertenece a ninguna comunidad activa');
  }

  const selectedMembership =
    (preferredCommunityId
      ? memberships.find((membership) => membership.community_id === preferredCommunityId)
      : null) ?? memberships[0];
  const communityId = selectedMembership.community_id;
  const communityName = selectedMembership.communities?.name ?? 'Comunidad';
  const userCommunities = memberships.map((membership) => ({
    id: membership.community_id,
    name: membership.communities?.name ?? 'Comunidad',
    roleKey: membership.role,
  }));

  const { data: membersData, error: membersError } = await supabase
    .from('community_memberships')
    .select('user_id, role, profiles(display_name, profile_alias, avatar_color, avatar_icon_key)')
    .eq('community_id', communityId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .returns<MemberRow[]>();

  if (membersError) {
    throw new Error(`No se pudieron obtener los integrantes: ${membersError.message}`);
  }

  const members = (membersData ?? []).map(toMember);

  const today = new Date();
  const resolvedRange = resolveActivityRange(activityRange, today);
  const rangeStartIso = toIsoDate(resolvedRange.start);
  const rangeEndIso = toIsoDate(resolvedRange.end);

  const { data: metricsData, error: metricsError } = await supabase
    .rpc('rpc_community_metrics', {
      p_community_id: communityId,
      p_start_date: rangeStartIso,
      p_end_date: rangeEndIso,
    })
    .returns<MetricsRow[]>();

  if (metricsError) {
    throw new Error(`No se pudieron obtener las métricas del periodo: ${metricsError.message}`);
  }

  const metricsRows = Array.isArray(metricsData) ? metricsData : [];
  const shiftedRange = shiftRange(resolvedRange.start, resolvedRange.end);
  const previousStartIso = toIsoDate(shiftedRange.previousStart);
  const previousEndIso = toIsoDate(shiftedRange.previousEnd);

  const { data: previousMetricsData, error: previousMetricsError } = await supabase
    .rpc('rpc_community_metrics', {
      p_community_id: communityId,
      p_start_date: previousStartIso,
      p_end_date: previousEndIso,
    })
    .returns<MetricsRow[]>();

  if (previousMetricsError) {
    throw new Error(`No se pudieron obtener las métricas del periodo anterior: ${previousMetricsError.message}`);
  }

  const previousMetricsRows = Array.isArray(previousMetricsData) ? previousMetricsData : [];

  let previousTotalTasks = 0;
  let previousTotalPoints = 0;
  for (const metric of previousMetricsRows) {
    previousTotalTasks += Number(metric.tasks_count ?? 0);
    previousTotalPoints += Number(metric.points_count ?? 0);
  }

  const tasksDeltaPercent = computeDeltaPercent(
    metricsRows.reduce((acc, metric) => acc + Number(metric.tasks_count ?? 0), 0),
    previousTotalTasks,
  );
  const pointsDeltaPercent = computeDeltaPercent(
    metricsRows.reduce((acc, metric) => acc + Number(metric.points_count ?? 0), 0),
    previousTotalPoints,
  );

  const periodTaskLogs: PeriodTaskLogRow[] = [];
  let taskLogsOffset = 0;

  while (true) {
    const { data: periodTaskLogsBatchData, error: periodTaskLogsBatchError } = await supabase
      .from('task_logs')
      .select(
        'id, task_id, member_user_id, performed_on, quantity, points_total, created_at, community_tasks(name, task_categories(name))',
      )
      .eq('community_id', communityId)
      .gte('performed_on', rangeStartIso)
      .lte('performed_on', rangeEndIso)
      .order('performed_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(taskLogsOffset, taskLogsOffset + PERIOD_TASK_LOGS_PAGE_SIZE - 1)
      .returns<PeriodTaskLogRow[]>();

    if (periodTaskLogsBatchError) {
      throw new Error(
        `No se pudieron obtener los registros del periodo: ${periodTaskLogsBatchError.message}`,
      );
    }

    const batch = Array.isArray(periodTaskLogsBatchData) ? periodTaskLogsBatchData : [];
    periodTaskLogs.push(...batch);

    if (batch.length < PERIOD_TASK_LOGS_PAGE_SIZE) {
      break;
    }

    taskLogsOffset += PERIOD_TASK_LOGS_PAGE_SIZE;
  }

  const { data: presenceRows, error: presenceError } = await supabase
    .rpc('rpc_community_presence', {
      p_community_id: communityId,
      p_date: toIsoDate(today),
    })
    .returns<PresenceRow[]>();

  if (presenceError) {
    throw new Error(`No se pudo obtener presencia diaria: ${presenceError.message}`);
  }

  const safePresenceRows = Array.isArray(presenceRows) ? presenceRows : [];

  const periodRowsByDate = new Map<string, WeeklyActivity>();

  const totalDays =
    Math.floor(
      (resolvedRange.end.getTime() - resolvedRange.start.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(resolvedRange.start, offset);
    const isoDate = toIsoDate(date);
    const row: WeeklyActivity = {
      metricDate: isoDate,
      day: activityRange === 'week' ? toWeekDayWithNumber(date) : toShortSpanishDate(date),
    };

    for (const member of members) {
      row[member.name] = 0;
      row[`${member.name}__points`] = 0;
    }

    periodRowsByDate.set(isoDate, row);
  }

  const memberNameByUserId = new Map(members.map((member) => [member.userId, member.name]));
  const memberMetricsByUserId = new Map<string, { tasks: number; points: number }>();
  const topTasksByTaskId = new Map<string, TopTaskMetric>();
  let totalTasks = 0;
  let totalPoints = 0;

  for (const metric of metricsRows) {
    const row = periodRowsByDate.get(metric.metric_date);
    const memberName = memberNameByUserId.get(metric.member_user_id);

    if (!row || !memberName) {
      continue;
    }

    const taskCount = Number(metric.tasks_count ?? 0);
    const pointsCount = Number(metric.points_count ?? 0);
    const current = Number(row[memberName] ?? 0);
    row[memberName] = current + taskCount;
    const pointsKey = `${memberName}__points`;
    const currentPoints = Number(row[pointsKey] ?? 0);
    row[pointsKey] = currentPoints + pointsCount;

    totalTasks += taskCount;
    totalPoints += pointsCount;

    const memberTotals = memberMetricsByUserId.get(metric.member_user_id) ?? { tasks: 0, points: 0 };
    memberTotals.tasks += taskCount;
    memberTotals.points += pointsCount;
    memberMetricsByUserId.set(metric.member_user_id, memberTotals);
  }

  for (const row of periodTaskLogs) {
    const taskInfo = toTaskInfo(row.community_tasks);
    const existing = topTasksByTaskId.get(row.task_id);
    const quantity = Number(row.quantity ?? 0);
    const points = Number(row.points_total ?? 0);

    if (!existing) {
      topTasksByTaskId.set(row.task_id, {
        taskId: row.task_id,
        taskName: taskInfo.taskName,
        categoryName: taskInfo.categoryName,
        tasks: quantity,
        points,
      });
      continue;
    }

    existing.tasks += quantity;
    existing.points += points;
  }

  const topTasks = Array.from(topTasksByTaskId.values())
    .sort((left, right) => {
      if (right.tasks !== left.tasks) {
        return right.tasks - left.tasks;
      }

      return right.points - left.points;
    })
    .slice(0, 5);

  const recentCommunityActivities: RecentCommunityActivity[] = periodTaskLogs.slice(0, 6).map((row) => {
    const taskInfo = toTaskInfo(row.community_tasks);
    const memberName = memberNameByUserId.get(row.member_user_id) ?? 'Integrante';
    return {
      id: row.id,
      memberUserId: row.member_user_id,
      memberName,
      taskName: taskInfo.taskName,
      categoryName: taskInfo.categoryName,
      performedOn: row.performed_on,
      quantity: Number(row.quantity ?? 0),
      pointsTotal: Number(row.points_total ?? 0),
    };
  });

  const presenceToday = safePresenceRows[0]
    ? {
        activeMembersCount: Number(safePresenceRows[0].active_members_count ?? 0),
        awayCount: Number(safePresenceRows[0].away_count ?? 0),
        presentCount: Number(safePresenceRows[0].present_count ?? 0),
      }
    : null;

  return {
    communityId,
    currentUserId: user.id,
    communityName,
    userCommunities,
    members,
    weeklyActivities: Array.from(periodRowsByDate.values()),
    activityRange,
    activityRangeLabel: resolvedRange.rangeLabel,
    activityMonthLabel: resolvedRange.monthLabel,
    previousRangeLabel: getPreviousRangeLabel(activityRange),
    totalTasks,
    totalPoints,
    previousTotalTasks,
    previousTotalPoints,
    tasksDeltaPercent,
    pointsDeltaPercent,
    memberPeriodMetrics: members.map((member) => {
      const memberTotals = memberMetricsByUserId.get(member.userId);
      return {
        userId: member.userId,
        tasks: memberTotals?.tasks ?? 0,
        points: memberTotals?.points ?? 0,
      };
    }),
    topTasks,
    recentCommunityActivities,
    presenceToday,
  };
}

export async function createCommunityInviteLink(
  communityId: string,
): Promise<CommunityInviteLinkData> {
  const supabase = getSupabaseClient();

  const normalizedCommunityId = communityId.trim();
  if (!normalizedCommunityId) {
    throw new Error('No se encontró una comunidad activa para invitar.');
  }

  const { data, error } = await supabase
    .rpc('rpc_create_community_invite', {
      p_community_id: normalizedCommunityId,
    })
    .returns<CreateCommunityInviteRow[]>();

  if (error) {
    throw new Error(`No se pudo generar la invitación: ${error.message}`);
  }

  const inviteRow = Array.isArray(data) ? data[0] : null;
  if (!inviteRow?.token) {
    throw new Error('No se pudo obtener el token de invitación.');
  }

  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('invite', inviteRow.token);

  return {
    token: inviteRow.token,
    inviteLink: inviteUrl.toString(),
    expiresAt: inviteRow.expires_at,
  };
}

export async function acceptCommunityInviteByToken(
  token: string,
): Promise<AcceptCommunityInviteResult> {
  const supabase = getSupabaseClient();
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error('La invitación no es válida.');
  }

  const { data, error } = await supabase
    .rpc('rpc_accept_community_invite', {
      p_token: normalizedToken,
    })
    .returns<AcceptCommunityInviteRow[]>();

  if (error) {
    throw new Error(`No se pudo aceptar la invitación: ${error.message}`);
  }

  const resultRow = Array.isArray(data) ? data[0] : null;
  if (!resultRow?.community_id || !resultRow?.community_name || !resultRow?.status) {
    throw new Error('La invitación no devolvió un resultado válido.');
  }

  return {
    status: resultRow.status,
    communityId: resultRow.community_id,
    communityName: resultRow.community_name,
  };
}
