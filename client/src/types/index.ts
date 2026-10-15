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

export type TransactionType = 'income' | 'expense';

export type IncomeCategory =
  | 'Client Payments'
  | 'Service Revenue'
  | 'Other Income';

export type ExpenseCategory =
  | 'Salaries'
  | 'Software and Tools'
  | 'Marketing'
  | 'Office Expenses'
  | 'Hosting and Infrastructure'
  | 'Travel'
  | 'Other Expenses';

export type TransactionCategory = IncomeCategory | ExpenseCategory;

export type PaymentMethod =
  | 'Bank Transfer'
  | 'UPI'
  | 'Credit Card'
  | 'Cheque'
  | 'Cash';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  linkedSalaryId?: string;
  linkedInvoiceId?: string;
  createdBy: string;
  createdAt: string;
}

// ---- Client companies (shapes returned by /api/clients) ----

export type ClientStatus = 'active' | 'inactive';

// A portal login belonging to a client company.
export interface PortalUser {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
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
}

export type SalaryPaymentStatus = 'Pending' | 'Paid';

export interface SalaryRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: Department;
  salaryMonth: string; // Format: 'YYYY-MM'
  baseSalary: number;
  adjustments: number; // Positive (bonus) or negative (deduction)
  finalPayableAmount: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  status: SalaryPaymentStatus;
  linkedExpenseTxnId?: string;
  isSlipPublished?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalarySlip {
  id: string;
  salaryRecordId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: Department;
  designation: string;
  salaryMonth: string; // YYYY-MM
  issueDate: string;
  basicSalary: number;
  allowances: { title: string; amount: number }[];
  deductions: { title: string; amount: number }[];
  netPayable: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: SalaryPaymentStatus;
  isPublished: boolean;
  publishedAt?: string;
  publishedBy?: string;
  notes?: string;
}

// Attendance and leave types live in types/attendance.ts; invoices and company settings in
// types/invoices.ts (API shapes).

export type AuditActionType =
  | 'SALARY_PAYMENT'
  | 'ATTENDANCE_CORRECTION'
  | 'SALARY_GENERATION'
  | 'SALARY_UPDATE'
  | 'SALARY_SLIP_PUBLISHED'
  | 'INVOICE_PAYMENT'
  | 'INVOICE_CREATED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_DELETED'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_UPDATED'
  | 'EMPLOYEE_DEACTIVATED'
  | 'EMPLOYEE_ACCOUNT_CREATED'
  | 'EMPLOYEE_ACCOUNT_STATUS_CHANGED'
  | 'ATTENDANCE_PUNCH_IN'
  | 'ATTENDANCE_PUNCH_OUT'
  | 'LEAVE_REQUESTED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'PASSWORD_CHANGED'
  | 'SETTINGS_UPDATED'
  | 'TRANSACTION_RECORDED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT';

export interface AuditLog {
  id: string;
  timestamp: string; // ISO 8601 string
  userId?: string;
  userName: string;
  userEmail?: string;
  userRole: UserRole;
  action: AuditActionType | string;
  entityType:
    | 'salary'
    | 'attendance'
    | 'leave'
    | 'invoice'
    | 'employee'
    | 'transaction'
    | 'auth'
    | 'settings';
  entityId?: string;
  details: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  ipAddress?: string;
}

export type ActivityLog = AuditLog;
