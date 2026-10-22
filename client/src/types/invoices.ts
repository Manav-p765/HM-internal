// Invoice and company settings shapes, exactly as /api/invoices and /api/settings/company return them.
// Money is always a decimal string with 2 places ("117.99"); never do arithmetic on it in the browser
// (the form's live preview in utils/money.ts is the only exception and is labelled as a preview).
// Every amount on an invoice is in the invoice's `currency`; a payment also carries `amountInr`, the INR the
// company received (what the ledger holds).
import type { InvoiceCurrency } from '../utils/money';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';
// Derived on the server: overdue (sent, balance > 0, past due date IST) wins over partially_paid.
export type InvoiceDerivedStatus = InvoiceStatus | 'overdue' | 'partially_paid';
export type InvoiceListStatus = InvoiceDerivedStatus | 'outstanding';

export const INVOICE_STATUS_LABEL: Record<InvoiceDerivedStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceDerivedStatus, 'success' | 'warning' | 'error' | 'neutral' | 'purple'> = {
  draft: 'neutral',
  sent: 'purple',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'error',
  cancelled: 'neutral',
};

export const PAYMENT_METHODS = ['Bank Transfer', 'UPI', 'Credit Card', 'Cheque', 'Cash'] as const;
export type InvoicePaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InvoiceItem {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface InvoicePayment {
  id: string; // the income transaction id
  txnDate: string;
  amount: string; // in the invoice's currency
  amountInr: string; // the INR received (the ledger amount); equals amount on an INR invoice
  paymentMethod: InvoicePaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  recordedByName: string;
  // A reversed payment stays listed (struck through) but no longer counts towards amountPaid.
  reversedAt: string | null;
  reversedByName: string | null;
  reverseReason: string | null;
}

export interface InvoiceSummaryRow {
  id: string;
  invoiceNumber: string | null; // null for drafts: the number is assigned when the invoice is sent
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  clientGstin: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: InvoiceCurrency;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balance: string;
  status: InvoiceStatus;
  derivedStatus: InvoiceDerivedStatus;
  notes: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// What to show where a number would be: drafts have none yet.
export const invoiceLabel = (invoice: Pick<InvoiceSummaryRow, 'invoiceNumber'>): string => invoice.invoiceNumber ?? 'Draft';

export interface Invoice extends InvoiceSummaryRow {
  totalInWords: string; // "One Lakh Eighteen Thousand Indian Rupees Only", from the server
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

// What the printed invoice (InvoiceDocument) reads. Both the staff invoice and the client portal invoice
// satisfy it, so the portal can print the same document from a response without internal fields.
export type PrintableInvoice = Pick<
  Invoice,
  | 'invoiceNumber' | 'status' | 'derivedStatus' | 'clientName' | 'clientEmail' | 'clientAddress' | 'clientGstin'
  | 'invoiceDate' | 'dueDate' | 'currency' | 'subtotal' | 'taxRate' | 'taxAmount' | 'total' | 'balance' | 'notes' | 'totalInWords' | 'items'
> & { payments: (Pick<InvoicePayment, 'id' | 'txnDate' | 'amount' | 'paymentMethod'> & { reversedAt?: string | null })[] };

export type PrintableCompany = Pick<
  CompanySettings,
  | 'companyName' | 'companyAddress' | 'companyPhone' | 'companyEmail' | 'companyGstin' | 'bankDetails' | 'terms' | 'logoDataUrl'
  | 'signatureDataUrl' | 'signatoryName' | 'signatoryDesignation'
>;

// Outstanding and overdue balances in one non-INR currency (summaries never add currencies together).
export interface CurrencyTotals {
  currency: InvoiceCurrency;
  outstandingTotal: string;
  overdueTotal: string;
}

// GET /api/portal/invoices: the client's own company's issued invoices (never drafts). No internal fields:
// no notes on payments, no cancel reason, no who-recorded-what, no reversed payments.
export interface PortalInvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: InvoiceCurrency;
  total: string;
  amountPaid: string;
  balance: string;
  status: Exclude<InvoiceStatus, 'draft'>;
  derivedStatus: Exclude<InvoiceDerivedStatus, 'draft'>;
}

export interface PortalInvoicesResponse {
  invoices: PortalInvoiceRow[];
  // outstandingTotal/overdueTotal: INR invoices; other currencies apart.
  summary: { count: number; outstandingTotal: string; overdueTotal: string; otherCurrencies: CurrencyTotals[]; overdueCount: number };
}

// GET /api/portal/invoices/:id: the invoice as printed, live payments only, and the issuing company's
// printed details (no invoice numbering, GST defaults or other settings).
export interface PortalInvoiceResponse {
  invoice: PrintableInvoice & PortalInvoiceRow;
  company: PrintableCompany;
}

export interface InvoicesSummary {
  outstandingTotal: string; // INR invoices
  overdueTotal: string; // INR invoices
  otherCurrencies: CurrencyTotals[]; // every other currency with a balance, never converted or added
  overdueCount: number;
  draftCount: number;
  collectedThisMonth: string; // INR received (the ledger)
}

export interface CompanySettings {
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyGstin: string | null;
  defaultGstRate: string;
  invoicePrefix: string;
  currency: 'INR';
  bankDetails: string | null;
  terms: string | null;
  invoiceNextNumber: number;
  logoDataUrl: string | null; // PNG/JPEG/WebP data URL checked by the server; printed on invoices
  signatureDataUrl: string | null; // same rules; printed above "Authorized Signatory"
  signatoryName: string | null;
  signatoryDesignation: string | null;
  nextInvoiceNumber: string;
  updatedAt: string;
}
