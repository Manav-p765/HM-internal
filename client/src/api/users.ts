import { api } from './client';
import { UserRole } from '../types';

export interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: { id: string; code: string; name: string } | null;
  clientId: string | null;
  client: { id: string; companyName: string; status: 'active' | 'inactive' } | null;
}

// An employee record that has no login yet.
export interface EmployeeOption {
  id: string;
  code: string;
  name: string;
  workEmail: string;
}

// Admin only. The server never returns passwords; credentials go to the user by email.
export const usersApi = {
  list: () => api<{ users: ManagedUser[] }>('/users').then(r => r.users),

  employeeOptions: () => api<{ employees: EmployeeOption[] }>('/users/employee-options').then(r => r.employees),

  // role 'client' requires clientId; other roles must not send one. Managers may create client users only.
  create: (input: { email: string; role: UserRole; employeeId?: string | null; clientId?: string | null }) =>
    api<{ user: ManagedUser }>('/users', { method: 'POST', body: input }).then(r => r.user),

  update: (id: string, changes: { role?: UserRole; status?: 'active' | 'disabled' }) =>
    api<{ user: ManagedUser }>(`/users/${id}`, { method: 'PATCH', body: changes }).then(r => r.user),

  resendCredentials: (id: string) =>
    api<{ user: ManagedUser }>(`/users/${id}/resend-credentials`, { method: 'POST' }).then(r => r.user),
};
