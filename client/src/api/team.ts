import { api } from './client';
import { Availability, PortalTeamMember } from '../types/attendance';

// Staff: today's status for everyone in the directory (status only).
export const teamApi = {
  availability: () =>
    api<{ availability: { employeeId: string; status: Availability | null }[] }>('/team/availability').then(r => r.availability),
};

// Client portal: the people on this company's projects.
export const portalTeamApi = {
  list: () => api<{ team: PortalTeamMember[] }>('/portal/team').then(r => r.team),
};
