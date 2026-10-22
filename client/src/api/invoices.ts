import { api } from './client';
import { toQuery } from './query';
import { Invoice, InvoiceListStatus, InvoicePaymentMethod, InvoicesSummary, InvoiceSummaryRow } from '../types/invoices';
import type { InvoiceCurrency } from '../utils/money';

export interface InvoiceListParams {
  status?: InvoiceListStatus;
  clientId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface InvoiceList {
  today: string;
  invoices: InvoiceSummaryRow[];
  total: number;
  limit: number;
  offset: number;
  summary: InvoicesSummary; // over all invoices, not the filtered page
}

// What the form sends. Money and quantities are decimal strings; the server computes every total.
export interface InvoiceItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceInput {
  clientId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientGstin?: string | null;
  invoiceDate?: string;
  dueDate: string;
  currency?: InvoiceCurrency; // omitted: the client's default currency (INR without a client)
  taxRate?: string;
  notes?: string | null;
  items: InvoiceItemInput[];
}

export interface PaymentInput {
  amount: string; // in the invoice's currency
  amountInr?: string; // the INR received; required for a non-INR invoice
  txnDate: string;
  paymentMethod: InvoicePaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
}

export const invoicesApi = {
  list: (params: InvoiceListParams = {}) => api<InvoiceList>(`/invoices${toQuery(params)}`),

  get: (id: string) => api<{ today: string; invoice: Invoice }>(`/invoices/${id}`),

  create: (input: InvoiceInput) => api<{ invoice: Invoice }>('/invoices', { method: 'POST', body: input }).then(r => r.invoice),

  update: (id: string, changes: Partial<InvoiceInput>) =>
    api<{ invoice: Invoice }>(`/invoices/${id}`, { method: 'PATCH', body: changes }).then(r => r.invoice),

  send: (id: string) => api<{ invoice: Invoice }>(`/invoices/${id}/send`, { method: 'POST', body: {} }).then(r => r.invoice),

  cancel: (id: string, reason: string) =>
    api<{ invoice: Invoice }>(`/invoices/${id}/cancel`, { method: 'POST', body: { reason } }).then(r => r.invoice),

  recordPayment: (id: string, input: PaymentInput) =>
    api<{ invoice: Invoice; paymentId: string }>(`/invoices/${id}/payments`, { method: 'POST', body: input }).then(r => r.invoice),

  // The payment row is kept and marked reversed (reason required); it stops counting towards the balance.
  reversePayment: (id: string, paymentId: string, reason: string) =>
    api<{ invoice: Invoice }>(`/invoices/${id}/payments/${paymentId}`, { method: 'DELETE', body: { reason } }).then(r => r.invoice),

  remove: (id: string) => api<void>(`/invoices/${id}`, { method: 'DELETE' }),
};
