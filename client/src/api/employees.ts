import { api } from './client';
import { DirectoryEntry, Employee, EmploymentStatus, MyEmployeeProfile } from '../types';

export interface EmployeeListParams {
  search?: string;
  status?: EmploymentStatus;
  department?: string;
  limit?: number;
  offset?: number;
}

export interface EmployeeList {
  employees: Employee[];
  total: number; // matching the filters
  limit: number;
  offset: number;
  // Whole roster, ignoring filters. monthlyPayroll is admin-only.
  summary: { total: number; active: number; onLeave: number; inactive: number; monthlyPayroll?: string };
}

// What the admin form sends. monthlySalary is a decimal string (never a float).
export interface EmployeeInput {
  fullName: string;
  workEmail: string;
  phone?: string | null;
  department: string;
  designation: string;
  joiningDate: string;
  status?: 'active' | 'on_leave';
  monthlySalary: string;
  paymentMethod?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
}

function toQuery(params: EmployeeListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const employeesApi = {
  list: (params: EmployeeListParams = {}) => api<EmployeeList>(`/employees${toQuery(params)}`),

  directory: () => api<{ employees: DirectoryEntry[] }>('/employees/directory').then(r => r.employees),

  me: () => api<{ employee: MyEmployeeProfile }>('/employees/me').then(r => r.employee),

  updateMe: (changes: { phone?: string | null; avatarUrl?: string | null }) =>
    api<{ employee: MyEmployeeProfile }>('/employees/me', { method: 'PATCH', body: changes }).then(r => r.employee),

  get: (id: string) => api<{ employee: Employee }>(`/employees/${id}`).then(r => r.employee),

  create: (input: EmployeeInput) =>
    api<{ employee: Employee }>('/employees', { method: 'POST', body: input }).then(r => r.employee),

  update: (id: string, changes: Partial<EmployeeInput>) =>
    api<{ employee: Employee }>(`/employees/${id}`, { method: 'PATCH', body: changes }).then(r => r.employee),

  deactivate: (id: string) =>
    api<{ employee: Employee }>(`/employees/${id}/deactivate`, { method: 'POST', body: {} }).then(r => r.employee),

  reactivate: (id: string, restoreLogin: boolean) =>
    api<{ employee: Employee }>(`/employees/${id}/reactivate`, { method: 'POST', body: { restoreLogin } }).then(
      r => r.employee,
    ),
};
