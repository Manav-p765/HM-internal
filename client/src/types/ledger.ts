// Ledger and report shapes, exactly as /api/transactions and /api/reports return them. Money is always a
// 2-decimal string ("45000.00", a net may be "-500.00"); every total is computed by the server in SQL.
import type { InvoiceDerivedStatus, InvoicePaymentMethod } from './invoices';
import type { InvoiceCurrency } from '../utils/money';

export type TxnType = 'income' | 'expense';
export type TxnSource = 'manual' | 'invoice' | 'salary';

export const TXN_TYPE_LABEL: Record<TxnType, string> = { income: 'Income', expense: 'Expense' };
export const TXN_SOURCE_LABEL: Record<TxnSource, string> = { manual: 'Manual', invoice: 'Invoice', salary: 'Salary' };

export interface LedgerRow {
  id: string;
  txnDate: string;
  type: TxnType;
  category: string;
  description: string;
  amount: string;
  paymentMethod: InvoicePaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  source: TxnSource;
  // Linked rows (owned by an invoice or a salary; never edited or voided here)
  invoiceId: string | null;
  invoiceNumber: string | null;
  salaryId: string | null;
  salaryMonth: string | null; // 'YYYY-MM'
  salaryEmployeeName: string | null;
  // Voided manual rows and reversed invoice/salary payments
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerTotals {
  income: string;
  expense: string;
  net: string;
  count: number;
}

export interface LedgerList {
  today: string; // IST, from the server
  transactions: LedgerRow[];
  total: number;
  limit: number;
  offset: number;
  totals: LedgerTotals; // the whole filtered set, voided rows never counted
  period: { from: string | null; to: string | null }; // the date range applied (a preset resolved by the server)
}

export interface TxnCategory {
  id: string;
  name: string;
  type: TxnType;
  isSystem: boolean; // "Invoice Payment" and "Salary": used by linked rows, never chosen for manual rows
  active: boolean; // inactive: hidden from pickers
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Reports ----
export const PERIOD_PRESETS = ['this_month', 'last_month', 'this_fy', 'last_fy'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_fy: 'This financial year',
  last_fy: 'Last financial year',
};

// What a report request sends: a preset, or a custom from/to range.
export type PeriodParams = { preset: PeriodPreset } | { from: string; to: string };

export interface ReportPeriod {
  from: string;
  to: string;
  preset: PeriodPreset | null;
}

export interface CategoryTotal {
  category: string;
  total: string;
  count: number;
}

export interface ProfitLoss {
  basis: 'cash';
  period: ReportPeriod;
  income: CategoryTotal[];
  expense: CategoryTotal[];
  totals: { income: string; expense: string; net: string };
}

export interface TrendMonth {
  month: string; // 'YYYY-MM'
  income: string;
  expense: string;
  net: string;
}

export interface Trend {
  today: string;
  months: TrendMonth[];
}

export type AgingBucket = 'not_due' | '0_30' | '31_60' | '61_90' | '90_plus';
export const AGING_LABEL: Record<AgingBucket, string> = {
  not_due: 'Not yet due',
  '0_30': '1–30 days overdue',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': 'Over 90 days',
};

export interface InvoiceReport {
  today: string;
  period: ReportPeriod;
  currency: InvoiceCurrency; // every figure below is in this currency only
  currencies: InvoiceCurrency[]; // INR first, then every other currency that has invoices
  summary: { invoiced: string; collected: string; outstanding: string; count: number };
  byStatus: { status: InvoiceDerivedStatus; count: number; total: string; outstanding: string }[];
  aging: { bucket: AgingBucket; count: number; balance: string }[];
  openInvoices: {
    id: string;
    invoiceNumber: string;
    clientName: string;
    dueDate: string;
    daysOverdue: number;
    bucket: AgingBucket;
    total: string;
    balance: string;
  }[];
  openInvoicesTruncated: boolean; // the list stops at 200; the aging totals always cover every open invoice
  topClients: {
    byInvoiced: { clientName: string; count: number; amount: string }[];
    byOutstanding: { clientName: string; count: number; amount: string }[];
  };
}

export interface SalaryReport {
  period: ReportPeriod;
  byMonth: { month: string; count: number; total: string }[];
  byDepartment: { department: string; count: number; headcount: number; total: string }[];
  totals: { paid: string; count: number; headcount: number };
  pending: { total: string; count: number };
}
