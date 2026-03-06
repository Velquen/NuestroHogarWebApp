export type MemberName = string;
export type CommunityRoleKey = 'owner' | 'admin' | 'member';

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
  day: string;
  [key: string]: string | number;
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
  presenceToday: PresenceSummary | null;
}
