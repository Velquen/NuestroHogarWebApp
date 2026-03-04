import type { CommunityDashboardData } from '../types/community';

const mockCommunityData: CommunityDashboardData = {
  communityName: 'Nuestro Hogar',
  members: [
    { name: 'Gaspar', role: 'Encargado de cocina', color: '#ca5a2e', initials: 'GA' },
    { name: 'Cristobal', role: 'Encargado de limpieza', color: '#2d8189', initials: 'CR' },
    { name: 'Fernanda', role: 'Encargada de compras', color: '#c88a20', initials: 'FE' },
  ],
  weeklyActivities: [
    { day: 'Lunes', Gaspar: 3, Cristobal: 1, Fernanda: 2 },
    { day: 'Martes', Gaspar: 2, Cristobal: 2, Fernanda: 2 },
    { day: 'Miércoles', Gaspar: 0, Cristobal: 0, Fernanda: 0 },
    { day: 'Jueves', Gaspar: 0, Cristobal: 0, Fernanda: 0 },
    { day: 'Viernes', Gaspar: 0, Cristobal: 0, Fernanda: 0 },
    { day: 'Sábado', Gaspar: 0, Cristobal: 0, Fernanda: 0 },
    { day: 'Domingo', Gaspar: 0, Cristobal: 0, Fernanda: 0 },
  ],
};

export async function fetchCommunityDashboard(): Promise<CommunityDashboardData> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockCommunityData), 420);
  });
}
