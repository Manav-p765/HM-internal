import { api } from './client';
import { toQuery } from './query';
import { LeaveInput, LeaveList, LeaveRequest, LeaveStatus, LeaveType, MyLeaves } from '../types/attendance';

export interface LeaveListParams {
  status?: LeaveStatus;
  employeeId?: string;
  leaveType?: LeaveType;
  department?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const leavesApi = {
  mine: () => api<MyLeaves>('/leaves/me'),
  apply: (input: LeaveInput) => api<{ leave: LeaveRequest }>('/leaves', { method: 'POST', body: input }).then(r => r.leave),
  update: (id: string, changes: Partial<LeaveInput>) =>
    api<{ leave: LeaveRequest }>(`/leaves/${id}`, { method: 'PATCH', body: changes }).then(r => r.leave),
  cancel: (id: string) => api<{ leave: LeaveRequest }>(`/leaves/${id}/cancel`, { method: 'POST', body: {} }).then(r => r.leave),

  // Admin, manager (never their own request: the server refuses it)
  list: (params: LeaveListParams = {}) => api<LeaveList>(`/leaves${toQuery(params)}`),
  approve: (id: string, comment?: string) =>
    api<{ leave: LeaveRequest }>(`/leaves/${id}/approve`, { method: 'POST', body: { comment } }).then(r => r.leave),
  reject: (id: string, reason: string) =>
    api<{ leave: LeaveRequest }>(`/leaves/${id}/reject`, { method: 'POST', body: { reason } }).then(r => r.leave),
};
