import { api } from './client';
import { UserRole } from '../types';

// The signed-in user as the server reports it (GET /api/auth/me).
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  // Client users only: their company.
  clientId: string | null;
  clientName: string | null;
  mustChangePassword: boolean;
  // From the linked employee record (null when the account isn't linked to one).
  name: string | null;
  designation: string | null;
  department: string | null;
  avatarUrl: string | null;
}

export const authApi = {
  me: () => api<{ user: SessionUser }>('/auth/me').then(r => r.user),

  login: (email: string, password: string) =>
    api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: { email, password } }).then(r => r.user),

  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ user: SessionUser }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }).then(r => r.user),

  forgotPassword: (email: string) =>
    api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),

  // The emailed invite or reset link (/set-password?token=...). Any bad link is the same 400 LINK_INVALID.
  checkSetPasswordLink: (token: string) =>
    api<{ valid: true; email: string; purpose: 'invite' | 'reset' }>(`/auth/set-password/check?token=${encodeURIComponent(token)}`),

  // Sets the password (sent exactly as typed) and signs this browser in.
  setPassword: (token: string, password: string) =>
    api<{ user: SessionUser }>('/auth/set-password', { method: 'POST', body: { token, password } }).then(r => r.user),
};
