import { api } from './client';
import { UserRole } from '../types';

export interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  // True while invited: the user has not used their set-password link yet and cannot sign in.
  invited: boolean;
  // When the newest unused invite link expires (null when there is none).
  inviteExpiresAt: string | null;
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

// Invited (no password yet), Active or Disabled, for the users lists.
export type AccountState = 'invited' | 'active' | 'disabled';
export const ACCOUNT_STATE_LABEL: Record<AccountState, string> = { invited: 'Invited', active: 'Active', disabled: 'Disabled' };
export function accountState(user: Pick<ManagedUser, 'status' | 'invited'>): AccountState {
  if (user.status === 'disabled') return 'disabled';
  return user.invited ? 'invited' : 'active';
}

// Admins (managers: client users). Nobody ever sees a password: users set their own from an emailed link.
export const usersApi = {
  list: () => api<{ users: ManagedUser[] }>('/users').then(r => r.users),

  employeeOptions: () => api<{ employees: EmployeeOption[] }>('/users/employee-options').then(r => r.employees),

  // role 'client' requires clientId; other roles must not send one. Managers may create client users only.
  create: (input: { email: string; role: UserRole; employeeId?: string | null; clientId?: string | null }) =>
    api<{ user: ManagedUser }>('/users', { method: 'POST', body: input }).then(r => r.user),

  update: (id: string, changes: { role?: UserRole; status?: 'active' | 'disabled' }) =>
    api<{ user: ManagedUser }>(`/users/${id}`, { method: 'PATCH', body: changes }).then(r => r.user),

  // A new 72-hour invite link for a user who has not set a password yet; older links stop working.
  resendInvite: (id: string) => api<{ user: ManagedUser }>(`/users/${id}/resend-invite`, { method: 'POST' }).then(r => r.user),

  // A 1-hour link to choose a new password; the current password keeps working until the link is used.
  sendResetLink: (id: string) => api<{ user: ManagedUser }>(`/users/${id}/send-reset-link`, { method: 'POST' }).then(r => r.user),

  // Admin: link a staff login to an employee record (one login per employee), or remove the link. Logins and
  // employees with the same email are linked automatically; this is for the rest.
  linkEmployee: (id: string, employeeId: string) =>
    api<{ user: ManagedUser }>(`/users/${id}/employee`, { method: 'PUT', body: { employeeId } }).then(r => r.user),
  unlinkEmployee: (id: string) => api<{ user: ManagedUser }>(`/users/${id}/employee`, { method: 'DELETE' }).then(r => r.user),
};
