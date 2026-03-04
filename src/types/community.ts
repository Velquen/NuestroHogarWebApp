export type MemberName = 'Gaspar' | 'Cristobal' | 'Fernanda';

export interface Member {
  name: MemberName;
  role: string;
  color: string;
  initials: string;
}

export interface WeeklyActivity {
  day: string;
  Gaspar: number;
  Cristobal: number;
  Fernanda: number;
}

export interface CommunityDashboardData {
  communityName: string;
  members: Member[];
  weeklyActivities: WeeklyActivity[];
}
