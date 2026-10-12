export type UserRole = 'admin' | 'manager' | 'employee';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  designation: string;
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

export type InvoiceStatus =
  | 'Draft'
  | 'Sent'
  | 'Partially Paid'
  | 'Paid'
  | 'Overdue'
  | 'Cancelled';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number; // percentage, e.g. 18 for 18%
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  notes?: string;
  payments: InvoicePayment[];
  createdAt: string;
  updatedAt: string;
}

export type EmploymentStatus = 'Active' | 'On Leave' | 'Inactive';

export type Department =
  | 'Engineering'
  | 'Design'
  | 'Marketing'
  | 'Operations'
  | 'Finance';

export interface Employee {
  id: string;
  fullName: string;
  workEmail: string;
  phoneNumber?: string;
  department: Department;
  designation: string;
  joiningDate: string;
  status: EmploymentStatus;
  monthlySalary: number; // Visible to admin and authorized manager
  paymentMethod?: string;
  notes?: string;
  avatarUrl?: string;
  userId?: string; // Linked Auth User ID
  accountStatus?: 'Active' | 'Needs Password Change' | 'Disabled' | 'Not Created';
  lastLogin?: string;
  createdAt: string;
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

export type AttendanceStatus =
  | 'Present'
  | 'Working'
  | 'Late'
  | 'Half Day'
  | 'Incomplete'
  | 'Absent'
  | 'On Leave';

export type LeaveType =
  | 'Casual Leave'
  | 'Sick Leave'
  | 'Earned Leave'
  | 'Unpaid Leave'
  | 'Other';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export type DayType = 'Full Day' | 'Half Day';

export type HalfDayPeriod = 'First Half' | 'Second Half';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: Department;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dayType: DayType;
  halfDayPeriod?: HalfDayPeriod;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  appliedAt: string; // ISO string
  reviewedBy?: string;
  reviewedByRole?: UserRole;
  reviewedAt?: string; // ISO string
  reviewerComment?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  date: string; // YYYY-MM-DD
  punchIn: string; // ISO string UTC
  punchOut?: string; // ISO string UTC
  durationMinutes: number; // Calculated elapsed duration in minutes
  status: AttendanceStatus;
  isManualCorrection?: boolean;
  correctionReason?: string;
  correctedBy?: string;
  correctedAt?: string;
  notes?: string;
}

export interface CompanySettings {
  companyName: string;
  companyLogoText: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyGstin: string;
  defaultCurrency: string; // 'INR', 'USD', 'EUR', 'GBP'
  financialYearStartMonth: number; // 4 = April
  invoicePrefix: string;
  taxRatePercentage: number;
  // Work hours & Attendance settings
  companyTimezone: string; // default 'Asia/Kolkata'
  workStartTime: string; // default '09:30'
  workEndTime: string; // default '18:30'
  expectedDailyHours: number; // default 8.0
  weeklyWorkingDays: number; // default 5
}

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

export type ActiveTab =
  | 'dashboard'
  | 'accounting'
  | 'invoices'
  | 'employees'
  | 'salary'
  | 'attendance'
  | 'leaves'
  | 'reports'
  | 'directory'
  | 'settings'
  // Employee restricted views:
  | 'my_dashboard'
  | 'my_attendance'
  | 'my_leaves'
  | 'my_salary_slips'
  | 'my_profile';
