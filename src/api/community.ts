import { getSupabaseClient } from '../lib/supabase';
import type { CommunityDashboardData, Member, WeeklyActivity } from '../types/community';

interface MembershipRow {
  community_id: string;
  communities: {
    name: string;
  } | null;
}

interface MemberRow {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
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

const roleLabels: Record<'owner' | 'admin' | 'member', string> = {
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

function toSpanishDayLabel(date: Date): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date).toLowerCase();
  return weekdayMap[day] ?? 'Lunes';
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
    role: roleLabels[row.role],
    color: row.profiles?.avatar_color ?? fallbackPalette[index % fallbackPalette.length],
    avatarIconKey: row.profiles?.avatar_icon_key ?? 'leaf_svg',
    initials: toInitials(displayName),
  };
}

export async function fetchCommunityDashboard(): Promise<CommunityDashboardData> {
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

  const { data: membership, error: membershipError } = await supabase
    .from('community_memberships')
    .select('community_id, communities(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`No se pudo obtener la comunidad del usuario: ${membershipError.message}`);
  }

  if (!membership) {
    throw new Error('El usuario no pertenece a ninguna comunidad activa');
  }

  const typedMembership = membership as MembershipRow;
  const communityId = typedMembership.community_id;
  const communityName = typedMembership.communities?.name ?? 'Comunidad';

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
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const weekStartIso = toIsoDate(weekStart);
  const weekEndIso = toIsoDate(weekEnd);

  const { data: metricsData, error: metricsError } = await supabase
    .rpc('rpc_community_metrics', {
      p_community_id: communityId,
      p_start_date: weekStartIso,
      p_end_date: weekEndIso,
    })
    .returns<MetricsRow[]>();

  if (metricsError) {
    throw new Error(`No se pudieron obtener las métricas semanales: ${metricsError.message}`);
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

  const weekRowsByDate = new Map<string, WeeklyActivity>();

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStart, offset);
    const isoDate = toIsoDate(date);
    const row: WeeklyActivity = {
      day: toSpanishDayLabel(date),
    };

    for (const member of members) {
      row[member.name] = 0;
    }

    weekRowsByDate.set(isoDate, row);
  }

  const memberNameByUserId = new Map(members.map((member) => [member.userId, member.name]));

  for (const metric of metricsData ?? []) {
    const row = weekRowsByDate.get(metric.metric_date);
    const memberName = memberNameByUserId.get(metric.member_user_id);

    if (!row || !memberName) {
      continue;
    }

    const current = Number(row[memberName] ?? 0);
    row[memberName] = current + Number(metric.tasks_count ?? 0);
  }

  const presenceToday = presenceRows?.[0]
    ? {
        activeMembersCount: Number(presenceRows[0].active_members_count ?? 0),
        awayCount: Number(presenceRows[0].away_count ?? 0),
        presentCount: Number(presenceRows[0].present_count ?? 0),
      }
    : null;

  return {
    communityId,
    currentUserId: user.id,
    communityName,
    members,
    weeklyActivities: Array.from(weekRowsByDate.values()),
    presenceToday,
  };
}
