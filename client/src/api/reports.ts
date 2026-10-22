import { api } from './client';
import { toQuery } from './query';
import { InvoiceReport, PeriodParams, ProfitLoss, SalaryReport, Trend } from '../types/ledger';
import type { InvoiceCurrency } from '../utils/money';

// Reports: admin only, except invoices (admin and manager). Every figure is computed by the server.
export const reportsApi = {
  profitLoss: (period: PeriodParams) => api<ProfitLoss>(`/reports/profit-loss${toQuery(period)}`),
  trend: (months = 12) => api<Trend>(`/reports/trend${toQuery({ months })}`),
  // One invoice currency at a time (INR by default); `currencies` in the answer lists the others.
  invoices: (period: PeriodParams, currency: InvoiceCurrency = 'INR') => api<InvoiceReport>(`/reports/invoices${toQuery({ ...period, currency })}`),
  salary: (period: PeriodParams) => api<SalaryReport>(`/reports/salary${toQuery(period)}`),
  // Same-origin download links (the session cookie goes with them).
  csvUrl: (report: 'profit-loss' | 'invoices' | 'salary', period: PeriodParams & { currency?: InvoiceCurrency }) =>
    `/api/reports/${report}.csv${toQuery(period)}`,
};
