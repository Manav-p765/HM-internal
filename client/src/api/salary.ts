import { api } from './client';
import { toQuery } from './query';
import { InvoicePaymentMethod } from '../types/invoices';
import { AdjustmentKind, Payslip, PayslipSummary, SalaryDetail, SalaryList } from '../types/salary';

export interface AdjustmentInput {
  label: string;
  kind: AdjustmentKind;
  amount: string;
}

export interface PayInput {
  paidOn: string;
  paymentMethod: InvoicePaymentMethod;
  referenceNumber?: string | null;
}

export interface SalaryPatch {
  notes?: string | null;
  baseSalary?: string;
  reason?: string; // required with baseSalary
}

type One = { salary: SalaryDetail };

// Admin only, except mySlips / mySlip (the caller's own published slips).
export const salaryApi = {
  list: (month?: string) => api<SalaryList>(`/salary${toQuery({ month })}`),

  generate: (month: string) => api<{ month: string; created: number; skipped: number }>('/salary/generate', { method: 'POST', body: { month } }),

  get: (id: string) => api<One>(`/salary/${id}`).then(r => r.salary),

  update: (id: string, patch: SalaryPatch) => api<One>(`/salary/${id}`, { method: 'PATCH', body: patch }).then(r => r.salary),

  addAdjustment: (id: string, input: AdjustmentInput) =>
    api<One>(`/salary/${id}/adjustments`, { method: 'POST', body: input }).then(r => r.salary),

  removeAdjustment: (id: string, lineId: string) =>
    api<One>(`/salary/${id}/adjustments/${lineId}`, { method: 'DELETE' }).then(r => r.salary),

  pay: (id: string, input: PayInput) => api<One>(`/salary/${id}/pay`, { method: 'POST', body: input }).then(r => r.salary),

  // The expense transaction is marked reversed (kept in the ledger); the row goes back to pending.
  unpay: (id: string, reason: string) => api<One>(`/salary/${id}/unpay`, { method: 'POST', body: { reason } }).then(r => r.salary),

  publishSlip: (id: string) => api<One>(`/salary/${id}/publish-slip`, { method: 'POST', body: {} }).then(r => r.salary),

  unpublishSlip: (id: string) => api<One>(`/salary/${id}/unpublish-slip`, { method: 'POST', body: {} }).then(r => r.salary),

  mySlips: () => api<{ slips: PayslipSummary[] }>('/salary/slips/me').then(r => r.slips),

  mySlip: (id: string) => api<{ slip: Payslip }>(`/salary/slips/me/${id}`).then(r => r.slip),
};
