// Invoice and company settings shapes, exactly as /api/invoices and /api/settings/company return them.
// Money is always a decimal string with 2 places ("117.99"); never do arithmetic on it in the browser
// (the form's live preview in utils/money.ts is the only exception and is labelled as a preview).

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
  amount: string;
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

export interface InvoicesSummary {
  outstandingTotal: string;
  overdueTotal: string;
  overdueCount: number;
  draftCount: number;
  collectedThisMonth: string;
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
  nextInvoiceNumber: string;
  updatedAt: string;
}
