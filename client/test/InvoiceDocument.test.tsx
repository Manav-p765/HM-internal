// The printed invoice (components/invoices/InvoiceDocument.tsx) rendered to static HTML. Fixtures are fake and
// shaped exactly like GET /api/invoices/:id and GET /api/settings/company responses.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceDocument } from '../src/components/invoices/InvoiceDocument';
import type { CompanySettings, Invoice, InvoicePayment } from '../src/types/invoices';
import { formatMoney } from '../src/utils/money';

const company: CompanySettings = {
  companyName: 'Example Studio (Fake) LLP',
  companyAddress: '12 Fake Street\nPune 411001',
  companyPhone: '+91 00000 00000',
  companyEmail: 'accounts@example.test',
  companyGstin: '27AAAAA0000A1Z5',
  defaultGstRate: '18.00',
  invoicePrefix: 'HM-',
  currency: 'INR',
  bankDetails: 'Fake Bank\nA/C 000000000000\nIFSC FAKE0000000',
  terms: 'Payment within 15 days.',
  invoiceNextNumber: 8,
  logoDataUrl: null,
  signatureDataUrl: null,
  signatoryName: null,
  signatoryDesignation: null,
  nextInvoiceNumber: 'HM-0008',
  updatedAt: '2026-10-14T04:00:00.000Z',
};

// Totals as the server computes them for 1 x 45000 + 12 x 1250.50 + 2.5 x 999.99 at 18%.
const invoice: Invoice = {
  id: '00000000-0000-4000-8000-000000000001',
  invoiceNumber: 'HM-0007',
  clientId: '00000000-0000-4000-8000-000000000002',
  clientName: 'Acme (Fake) Pvt Ltd',
  clientEmail: 'billing@acme.example.test',
  clientAddress: '1 Fake Road\nMumbai',
  clientGstin: '27BBBBB1111B1Z5',
  invoiceDate: '2026-10-14',
  dueDate: '2026-10-29',
  currency: 'INR',
  subtotal: '62505.98',
  taxRate: '18.00',
  taxAmount: '11251.08',
  total: '73757.06',
  amountPaid: '0.00',
  balance: '73757.06',
  status: 'sent',
  derivedStatus: 'sent',
  notes: null,
  sentAt: '2026-10-14T04:00:00.000Z',
  cancelledAt: null,
  cancelReason: null,
  createdAt: '2026-10-14T04:00:00.000Z',
  updatedAt: '2026-10-14T04:00:00.000Z',
  totalInWords: 'Seventy Three Thousand Seven Hundred and Fifty Seven Indian Rupees and Six Paise Only',
  items: [
    { id: 'i1', position: 1, description: 'Website design', quantity: '1.00', unitPrice: '45000.00', lineTotal: '45000.00' },
    { id: 'i2', position: 2, description: 'Support hours', quantity: '12.00', unitPrice: '1250.50', lineTotal: '15006.00' },
    { id: 'i3', position: 3, description: 'Hosting', quantity: '2.50', unitPrice: '999.99', lineTotal: '2499.98' },
  ],
  payments: [],
};

const payment = (over: Partial<InvoicePayment>): InvoicePayment => ({
  id: 'p1',
  txnDate: '2026-10-15',
  amount: '10000.00',
  amountInr: '10000.00',
  paymentMethod: 'UPI',
  referenceNumber: 'UTR-FAKE',
  notes: null,
  createdAt: '2026-10-15T04:00:00.000Z',
  recordedByName: 'Admin',
  reversedAt: null,
  reversedByName: null,
  reverseReason: null,
  ...over,
});

const render = (inv: Invoice = invoice, co: CompanySettings = company) => renderToStaticMarkup(<InvoiceDocument invoice={inv} company={co} />);

// Text content of the (single) element with this data-testid.
function text(html: string, testId: string): string {
  const matches = [...html.matchAll(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`, 'g'))];
  expect(matches, testId).toHaveLength(1);
  return matches[0][1].replace(/&amp;/g, '&');
}

describe('InvoiceDocument totals', () => {
  it('prints exactly the API totals, line amounts and total in words', () => {
    const html = render();
    expect(text(html, 'subtotal')).toBe(formatMoney(invoice.subtotal));
    expect(text(html, 'tax-amount')).toBe(formatMoney(invoice.taxAmount));
    expect(text(html, 'grand-total')).toBe(formatMoney(invoice.total));
    expect(text(html, 'balance')).toBe(formatMoney(invoice.balance));
    expect(text(html, 'balance-due-panel')).toBe(formatMoney(invoice.balance));
    expect(text(html, 'total-in-words')).toBe(invoice.totalInWords);
    // Indian grouping, 2 decimals.
    expect(text(html, 'grand-total')).toBe('₹73,757.06');
    for (const item of invoice.items) expect(html).toContain(formatMoney(item.lineTotal));
    expect(html.match(/data-testid="invoice-line"/g)).toHaveLength(3);
    expect(html).toContain('GST (18%)');
  });

  it('lists live payments only and the server balance', () => {
    const html = render({
      ...invoice,
      amountPaid: '10000.00',
      balance: '63757.06',
      derivedStatus: 'partially_paid',
      payments: [payment({ id: 'p1' }), payment({ id: 'p2', amount: '5000.00', reversedAt: '2026-10-15T05:00:00.000Z' })],
    });
    expect(html.match(/data-testid="payment-line"/g)).toHaveLength(1);
    expect(html).toContain('-₹10,000.00');
    expect(html).not.toContain('₹5,000.00');
    expect(text(html, 'balance')).toBe('₹63,757.06');
    expect(html).toContain('Partially Paid');
  });

  it("prints a foreign-currency invoice in its own currency, never the INR received", () => {
    const html = render({
      ...invoice,
      currency: 'USD',
      amountPaid: '10000.00',
      balance: '63757.06',
      totalInWords: 'Seventy Three Thousand Seven Hundred and Fifty Seven US Dollars and Six Cents Only',
      payments: [payment({ amountInr: '835000.00' })],
    });
    expect(text(html, 'grand-total')).toBe('$73,757.06');
    expect(text(html, 'balance-due-panel')).toBe('$63,757.06');
    expect(html).toContain('Rate (USD)');
    expect(html).toContain('-$10,000.00');
    expect(html).not.toContain('₹');
    expect(html).not.toContain('835,000');
  });
});

describe('InvoiceDocument draft vs sent', () => {
  it('a sent invoice is a Tax Invoice with its number and no watermark', () => {
    const html = render();
    expect(text(html, 'invoice-title')).toBe('Tax Invoice');
    expect(text(html, 'invoice-number')).toBe('HM-0007');
    expect(html).not.toContain('draft-watermark');
  });

  it('a draft shows the DRAFT watermark and "Draft" instead of a number', () => {
    const html = render({ ...invoice, invoiceNumber: null, status: 'draft', derivedStatus: 'draft', sentAt: null });
    expect(html).toContain('data-testid="draft-watermark"');
    expect(html).toContain('>DRAFT<');
    expect(text(html, 'invoice-title')).toBe('Draft Invoice');
    expect(text(html, 'invoice-number')).toBe('Draft');
    expect(html).not.toMatch(/HM-\d/); // not the next number either
  });

  it('a cancelled invoice keeps its number and says so', () => {
    const html = render({ ...invoice, status: 'cancelled', derivedStatus: 'cancelled', balance: '0.00' });
    expect(text(html, 'invoice-title')).toBe('Invoice (Cancelled)');
    expect(text(html, 'invoice-number')).toBe('HM-0007');
  });
});

describe('InvoiceDocument company settings', () => {
  it('company, bank details, terms and signatory come from settings; no logo when none is set', () => {
    const html = render();
    expect(html).toContain('Example Studio (Fake) LLP');
    expect(html).toContain('27AAAAA0000A1Z5');
    expect(html).toContain('IFSC FAKE0000000');
    expect(html).toContain('Payment within 15 days.');
    expect(html).toContain('Authorized Signatory');
    expect(html).not.toContain('<img');
  });

  it('prints the logo from settings', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    expect(render(invoice, { ...company, logoDataUrl: logo })).toContain(`src="${logo}"`);
  });

  it('prints the signature image, signatory name and designation from settings', () => {
    const signature = 'data:image/png;base64,iVBORw0KGgo=';
    const html = render(invoice, { ...company, signatureDataUrl: signature, signatoryName: 'Asha Rao (Fake)', signatoryDesignation: 'Director' });
    expect(html).toContain(`src="${signature}"`);
    expect(text(html, 'signatory-name')).toBe('Asha Rao (Fake)');
    expect(html).toContain('Director');
    expect(html).toContain('Authorized Signatory');
  });

  it('leaves out empty optional blocks', () => {
    const html = render(invoice, { ...company, bankDetails: null, terms: null, companyGstin: null });
    expect(html).not.toContain('Bank Details');
    expect(html).not.toContain('>Terms<');
    expect(html.match(/GSTIN:/g)).toHaveLength(1); // the client's only
  });
});

describe('InvoiceDocument escapes user text', () => {
  it('names, addresses, descriptions, notes and settings text never become markup', () => {
    const html = render(
      {
        ...invoice,
        clientName: '<script>alert("client")</script>',
        clientAddress: '<img src=x onerror=alert(1)>',
        notes: 'Thanks & regards <b>bold</b> "quoted" \'single\'',
        items: [{ ...invoice.items[0], description: '</td><td>injected' }],
      },
      { ...company, companyName: 'R&D <i>Studio</i>', bankDetails: '<a href="javascript:alert(1)">pay</a>', terms: '<style>body{}</style>' },
    );
    expect(html).not.toMatch(/<script|<img|<b>|<i>|<a |<style|<\/td><td>injected/);
    expect(html).toContain('&lt;script&gt;alert(&quot;client&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Thanks &amp; regards &lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('R&amp;D &lt;i&gt;Studio&lt;/i&gt;');
    expect(html).toContain('&lt;/td&gt;&lt;td&gt;injected');
    expect(text(html, 'bill-to-name')).toBe('&lt;script&gt;alert(&quot;client&quot;)&lt;/script&gt;');
  });
});
