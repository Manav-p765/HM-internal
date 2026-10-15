// Salary and payslip shapes, exactly as /api/salary returns them. Money is always a decimal string with 2
// places ("50000.00"; adjustments may be negative, "-2000.00"); the browser never computes stored amounts.
import type { InvoicePaymentMethod } from './invoices';

export type SalaryStatus = 'pending' | 'paid';
export const SALARY_STATUS_LABEL: Record<SalaryStatus, string> = { pending: 'Pending', paid: 'Paid' };

export type AdjustmentKind = 'earning' | 'deduction';
export const ADJUSTMENT_KIND_LABEL: Record<AdjustmentKind, string> = { earning: 'Earning', deduction: 'Deduction' };

export interface SalaryRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  month: string; // 'YYYY-MM'
  baseSalary: string;
  adjustments: string; // earnings minus deductions
  netPayable: string;
  status: SalaryStatus;
  paidOn: string | null;
  paymentMethod: InvoicePaymentMethod | null;
  slipPublishedAt: string | null;
  slipPublished: boolean;
  notes: string | null;
  // Approved unpaid leave in the month, in weekdays (informational; nothing is deducted automatically).
  unpaidLeaveDays: number;
  lineCount?: number; // list only
  createdAt: string;
  updatedAt: string;
}

export interface SalaryLine {
  id: string;
  label: string;
  kind: AdjustmentKind;
  amount: string;
  createdAt: string;
  createdByName: string | null;
}

export interface SalaryDetail extends SalaryRow {
  lines: SalaryLine[];
  transactionId: string | null; // the live expense transaction while paid
  referenceNumber: string | null;
}

export interface SalarySummary {
  totalPayable: string;
  totalPaid: string;
  totalPending: string;
  headcount: number;
  paidCount: number;
}

export interface SalaryList {
  today: string; // IST, from the server
  month: string;
  salaries: SalaryRow[];
  summary: SalarySummary;
  canGenerate: boolean; // at most one month ahead
}

// An employee's own published slips.
export interface PayslipSummary {
  id: string;
  month: string;
  netPayable: string;
  paidOn: string;
}

export interface Payslip {
  id: string;
  month: string;
  employee: { name: string; code: string; department: string; designation: string };
  company: { name: string; address: string | null };
  baseSalary: string;
  lines: { label: string; kind: AdjustmentKind; amount: string }[];
  adjustments: string;
  netPayable: string;
  paidOn: string;
  paymentMethod: InvoicePaymentMethod;
  publishedAt: string;
}
