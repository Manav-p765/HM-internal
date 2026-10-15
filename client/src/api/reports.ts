import { api } from './client';
import { toQuery } from './query';
import { InvoiceReport, PeriodParams, ProfitLoss, SalaryReport, Trend } from '../types/ledger';

// Reports: admin only, except invoices (admin and manager). Every figure is computed by the server.
export const reportsApi = {
  profitLoss: (period: PeriodParams) => api<ProfitLoss>(`/reports/profit-loss${toQuery(period)}`),
  trend: (months = 12) => api<Trend>(`/reports/trend${toQuery({ months })}`),
  invoices: (period: PeriodParams) => api<InvoiceReport>(`/reports/invoices${toQuery(period)}`),
  salary: (period: PeriodParams) => api<SalaryReport>(`/reports/salary${toQuery(period)}`),
  // Same-origin download links (the session cookie goes with them).
  csvUrl: (report: 'profit-loss' | 'invoices' | 'salary', period: PeriodParams) => `/api/reports/${report}.csv${toQuery(period)}`,
};
