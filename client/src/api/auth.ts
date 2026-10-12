import { api } from './client';
import { UserRole } from '../types';

// The signed-in user as the server reports it (GET /api/auth/me).
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  mustChangePassword: boolean;
  name: string | null;
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

  resetPassword: (token: string, newPassword: string) =>
    api<{ message: string }>('/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
};
