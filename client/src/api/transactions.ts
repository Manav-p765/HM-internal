import { api } from './client';
import { toQuery } from './query';
import { InvoicePaymentMethod } from '../types/invoices';
import { LedgerList, LedgerRow, PeriodPreset, TxnCategory, TxnSource, TxnType } from '../types/ledger';

export interface LedgerFilters {
  type?: TxnType;
  category?: string;
  from?: string;
  to?: string;
  paymentMethod?: InvoicePaymentMethod;
  source?: TxnSource;
  search?: string;
  includeVoided?: boolean;
  preset?: PeriodPreset; // instead of from/to; resolved on the server
  limit?: number;
  offset?: number;
}

// What the form sends for a manual row. Amounts are decimal strings; the server validates and stores them.
export interface ManualTxnInput {
  txnDate: string;
  type: TxnType;
  category: string;
  description: string;
  amount: string;
  paymentMethod: InvoicePaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
}

type One = { transaction: LedgerRow };

// The ledger (admin only). Linked invoice/salary rows can't be edited or voided here (409 LINKED_TRANSACTION).
export const transactionsApi = {
  list: (filters: LedgerFilters = {}) => api<LedgerList>(`/transactions${toQuery(filters)}`),

  // A same-origin download link for the filtered set (the session cookie goes with it).
  exportUrl: (filters: Omit<LedgerFilters, 'limit' | 'offset'> = {}) => `/api/transactions/export.csv${toQuery(filters)}`,

  create: (input: ManualTxnInput) => api<One>('/transactions', { method: 'POST', body: input }).then(r => r.transaction),

  update: (id: string, changes: Partial<ManualTxnInput>) =>
    api<One>(`/transactions/${id}`, { method: 'PATCH', body: changes }).then(r => r.transaction),

  void: (id: string, reason: string) => api<One>(`/transactions/${id}/void`, { method: 'POST', body: { reason } }).then(r => r.transaction),

  categories: () => api<{ categories: TxnCategory[] }>('/transactions/categories').then(r => r.categories),

  createCategory: (input: { name: string; type: TxnType }) =>
    api<{ category: TxnCategory }>('/transactions/categories', { method: 'POST', body: input }).then(r => r.category),

  updateCategory: (id: string, changes: { name?: string; active?: boolean }) =>
    api<{ category: TxnCategory }>(`/transactions/categories/${id}`, { method: 'PATCH', body: changes }).then(r => r.category),
};
