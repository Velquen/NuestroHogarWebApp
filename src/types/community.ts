export type MemberName = string;
export type CommunityRoleKey = 'owner' | 'admin' | 'member';
export type ActivityRange = 'week' | 'month';

export interface Member {
  userId: string;
  baseName: string;
  alias: string | null;
  name: MemberName;
  roleKey: CommunityRoleKey;
  role: string;
  color: string;
  avatarIconKey: string | null;
  initials: string;
}

export interface WeeklyActivity {
  metricDate: string;
  day: string;
  [key: string]: string | number;
}

export interface MemberPeriodMetrics {
  userId: string;
  tasks: number;
  points: number;
}

export interface TopTaskMetric {
  taskId: string;
  taskName: string;
  categoryName: string;
  tasks: number;
  points: number;
}

export interface RecentCommunityActivity {
  id: string;
  memberUserId: string;
  memberName: string;
  taskName: string;
  categoryName: string;
  performedOn: string;
  quantity: number;
  pointsTotal: number;
}

export interface PresenceSummary {
  activeMembersCount: number;
  awayCount: number;
  presentCount: number;
}

export interface UserCommunitySummary {
  id: string;
  name: string;
  roleKey: CommunityRoleKey;
}

export interface CommunityDashboardData {
  communityId: string;
  currentUserId: string;
  communityName: string;
  userCommunities: UserCommunitySummary[];
  members: Member[];
  weeklyActivities: WeeklyActivity[];
  activityRange: ActivityRange;
  activityRangeLabel: string;
  activityMonthLabel: string;
  previousRangeLabel: string;
  totalTasks: number;
  totalPoints: number;
  previousTotalTasks: number;
  previousTotalPoints: number;
  tasksDeltaPercent: number | null;
  pointsDeltaPercent: number | null;
  memberPeriodMetrics: MemberPeriodMetrics[];
  topTasks: TopTaskMetric[];
  recentCommunityActivities: RecentCommunityActivity[];
  presenceToday: PresenceSummary | null;
}
