import type { InvoiceCurrency } from '../utils/money';

export type UserRole = 'admin' | 'manager' | 'employee' | 'client';
export type StaffRole = Exclude<UserRole, 'client'>;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  designation: string;
  department?: string;
  employeeId?: string; // Links to Employee record
}

// Ledger transactions, categories and reports: types/ledger.ts (API shapes).

// ---- Client companies (shapes returned by /api/clients) ----

export type ClientStatus = 'active' | 'inactive';

// A portal login belonging to a client company.
export interface PortalUser {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  invited: boolean; // true while the user has no password yet (invite link not used)
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  gstin: string | null;
  currency: InvoiceCurrency; // default currency of the client's new invoices
  status: ClientStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  portalUsers: number;
  activePortalUsers: number;
  users?: PortalUser[]; // detail (GET /api/clients/:id) only
}

// GET /api/clients/me: what a client user sees of their own company (no notes, no GSTIN).
export interface MyClientCompany {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  status: ClientStatus;
}

// ---- Employees (shapes returned by /api/employees) ----

export type EmploymentStatus = 'active' | 'on_leave' | 'inactive';

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
};

// Free text on the server; the UI offers this list.
export type Department = string;
export const DEPARTMENTS: Department[] = ['Engineering', 'Design', 'Marketing', 'Operations', 'Finance'];

// The employee's login account, if one exists (admin/manager views only).
export interface EmployeeLogin {
  userId: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  invited: boolean; // true while the user has no password yet (invite link not used)
  lastLoginAt: string | null;
}

export interface Employee {
  id: string;
  code: string; // EMP-001, assigned by the server
  fullName: string;
  workEmail: string;
  phone: string | null;
  department: Department;
  designation: string;
  joiningDate: string; // YYYY-MM-DD
  status: EmploymentStatus;
  notes: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  login: EmployeeLogin | null;
  // Working hours, 'HH:MM' IST (the end may be earlier: an overnight shift). null for employees created
  // before working hours existed: admins are reminded to set them.
  shiftStart: string | null;
  shiftEnd: string | null;
  // Only present for admins; the server omits these fields for everyone else.
  monthlySalary?: string; // NUMERIC(14,2) as a string
  paymentMethod?: string | null;
}

// GET /api/employees/directory: visible to all staff.
export interface DirectoryEntry {
  id: string;
  fullName: string;
  designation: string;
  department: Department;
  workEmail: string;
  avatarUrl: string | null;
  status: EmploymentStatus;
}

// GET /api/employees/me: the signed-in user's own record (no salary or admin notes).
export interface MyEmployeeProfile {
  id: string;
  code: string;
  fullName: string;
  workEmail: string;
  phone: string | null;
  department: Department;
  designation: string;
  joiningDate: string;
  status: EmploymentStatus;
  avatarUrl: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}

// "21:00 – 06:00 IST" for a shift, or null when working hours are not set.
export function shiftLabel(shift: { shiftStart: string | null; shiftEnd: string | null } | null | undefined): string | null {
  return shift?.shiftStart && shift.shiftEnd ? `${shift.shiftStart} – ${shift.shiftEnd} IST` : null;
}

// Salaries and payslips live in types/salary.ts.
// Attendance and leave types live in types/attendance.ts; invoices and company settings in
// types/invoices.ts (API shapes).

// The audit trail is server-side (audit_logs, written by server/src/services/audit.ts).
