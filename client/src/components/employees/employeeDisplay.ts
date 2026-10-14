import { Employee, EmploymentStatus } from '../../types';

export const statusBadgeVariant = (status: EmploymentStatus) =>
  status === 'active' ? 'success' : status === 'on_leave' ? 'warning' : 'neutral';

// Login account state shown in the employees table ("Account Status" column).
export function loginStatus(employee: Employee): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (!employee.login) return { label: 'No login', variant: 'neutral' };
  if (employee.login.status === 'disabled') return { label: 'Disabled', variant: 'danger' };
  if (employee.login.mustChangePassword) return { label: 'Temporary password', variant: 'warning' };
  return { label: 'Active', variant: 'success' };
}
