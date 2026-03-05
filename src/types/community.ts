export type MemberName = string;

export interface Member {
  userId: string;
  baseName: string;
  alias: string | null;
  name: MemberName;
  role: string;
  color: string;
  avatarIconKey: string | null;
  initials: string;
}

export interface WeeklyActivity {
  day: string;
  [key: string]: string | number;
}

export interface PresenceSummary {
  activeMembersCount: number;
  awayCount: number;
  presentCount: number;
}

export interface CommunityDashboardData {
  communityId: string;
  currentUserId: string;
  communityName: string;
  members: Member[];
  weeklyActivities: WeeklyActivity[];
  presenceToday: PresenceSummary | null;
}
