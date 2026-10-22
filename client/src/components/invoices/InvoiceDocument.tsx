import React from 'react';
import { INVOICE_STATUS_LABEL, invoiceLabel, PrintableCompany, PrintableInvoice } from '../../types/invoices';
import { formatDate } from '../../utils/formatters';
import { formatMoney, trimRate } from '../../utils/money';

// The printed invoice (/invoices/:id/print), laid out like the old invoice generator's "Tax Invoice"
// template: company block and title over a navy rule, invoice meta beside a "Balance Due" panel, a shaded
// "Bill To" box, the items table with a navy header (padded to five rows), total in words beside the totals,
// notes and bank details, terms, and the signature block.
//
// Alignment: the totals column is exactly as wide as the table's Rate + Amount columns, so every figure sits
// in the Amount column; notes and bank details share a row only when both exist (either alone starts at the
// left margin). Amounts use tabular figures in the body font.
//
// Pure: everything comes from props. Company details, logo, signature, bank details and terms come from
// company settings; every amount and the total in words are server strings in the invoice's currency (nothing
// is computed here). All text is rendered as React text nodes, so names, addresses and notes can never inject
// markup; the logo and signature are data URLs the server has checked (PNG/JPEG/WebP only).
const NAVY = '#2c3e50';
const MIN_ROWS = 5;
// Rate and Amount columns (w-32 each); the totals block below them uses the same width.
const MONEY_COL = 'w-32';
const TOTALS_WIDTH = 'sm:w-64';

export const InvoiceDocument: React.FC<{ invoice: PrintableInvoice; company: PrintableCompany }> = ({ invoice, company }) => {
  const { currency } = invoice;
  const money = (value: string) => formatMoney(value, currency);
  const isDraft = invoice.status === 'draft';
  const title = isDraft ? 'Draft Invoice' : invoice.status === 'cancelled' ? 'Invoice (Cancelled)' : 'Tax Invoice';
  const livePayments = invoice.payments.filter(p => !p.reversedAt);
  const emptyRows = Math.max(0, MIN_ROWS - invoice.items.length);
  const sideBySide = Boolean(invoice.notes && company.bankDetails);
  const sectionHeading = 'text-[10px] font-bold uppercase mb-1 pb-0.5 border-b border-[#dee2e6]';

  return (
    <div className="hm-invoice relative text-[11px] leading-[1.4] text-[#1a1a1a]" data-testid="invoice-document">
      {isDraft && (
        // Printed too: a draft has no number and is not a tax invoice.
        <div aria-hidden data-testid="draft-watermark" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="text-[96px] font-black tracking-[0.2em] text-[#E11D48]/10 -rotate-30 select-none">DRAFT</span>
        </div>
      )}

      {/* Header: company block | logo + title */}
      <header className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-3 mb-5 border-b-2 print-row" style={{ borderColor: NAVY }}>
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-lg font-bold mb-1" style={{ color: NAVY }}>
            {company.companyName}
          </h1>
          {company.companyAddress && <p className="text-[10px] text-[#555] whitespace-pre-line mb-0.5">{company.companyAddress}</p>}
          {company.companyGstin && (
            <p className="text-[10px] text-[#555] mb-0.5">
              <strong>GSTIN:</strong> <span className="tracking-wide">{company.companyGstin}</span>
            </p>
          )}
          {company.companyEmail && <p className="text-[10px] text-[#555] mb-0.5">{company.companyEmail}</p>}
          {company.companyPhone && <p className="text-[10px] text-[#555]">{company.companyPhone}</p>}
        </div>
        <div className="sm:text-right shrink-0 flex flex-col sm:items-end">
          {company.logoDataUrl && (
            <img src={company.logoDataUrl} alt="" data-testid="invoice-logo" className="max-h-[70px] max-w-[200px] mb-2.5 object-contain" />
          )}
          <p className="text-2xl font-bold uppercase leading-none" style={{ color: NAVY }} data-testid="invoice-title">
            {title}
          </p>
        </div>
      </header>

      {/* Meta | balance due */}
      <section className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-5 print-row">
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 items-baseline">
          <dt className="font-bold text-[#666] text-[9px] uppercase">Invoice No:</dt>
          <dd className="font-semibold tracking-wide" data-testid="invoice-number">
            {invoiceLabel(invoice)}
          </dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Invoice Date:</dt>
          <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Due Date:</dt>
          <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Currency:</dt>
          <dd className="font-medium">{currency}</dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Status:</dt>
          <dd className="font-medium">{INVOICE_STATUS_LABEL[invoice.derivedStatus]}</dd>
        </dl>
        <div className={`text-white px-4 py-2.5 rounded text-right w-full ${TOTALS_WIDTH}`} style={{ background: NAVY }}>
          <p className="text-[8px] uppercase tracking-wider text-[#bdc3c7] mb-0.5">Balance Due</p>
          <p className="text-lg font-bold tabular-nums" data-testid="balance-due-panel">
            {money(invoice.balance)}
          </p>
        </div>
      </section>

      {/* Bill to */}
      <section className="mb-5 p-2.5 bg-[#f8f9fa] rounded break-inside-avoid">
        <p className="text-[9px] font-bold uppercase mb-1 pb-0.5 border-b border-[#dee2e6]" style={{ color: NAVY }}>
          Bill To
        </p>
        <p className="text-xs font-bold mb-0.5" data-testid="bill-to-name">
          {invoice.clientName}
        </p>
        {invoice.clientAddress && <p className="text-[10px] text-[#444] whitespace-pre-line">{invoice.clientAddress}</p>}
        {invoice.clientGstin && (
          <p className="text-[10px] text-[#444]">
            <strong>GSTIN:</strong> <span className="tracking-wide">{invoice.clientGstin}</span>
          </p>
        )}
        {invoice.clientEmail && <p className="text-[10px] text-[#444]">{invoice.clientEmail}</p>}
      </section>

      {/* Items */}
      <table className="w-full border-collapse mb-4 table-fixed">
        <thead>
          <tr className="text-white text-[9px] font-bold uppercase" style={{ background: NAVY }}>
            <th className="w-10 py-2 px-2.5 text-center">#</th>
            <th className="py-2 px-2.5 text-left">Description</th>
            <th className="w-16 py-2 px-2.5 text-right">Qty</th>
            <th className={`${MONEY_COL} py-2 px-2.5 text-right`}>Rate ({currency})</th>
            <th className={`${MONEY_COL} py-2 px-2.5 text-right`}>Amount ({currency})</th>
          </tr>
        </thead>
        <tbody className="text-[10px]">
          {invoice.items.map((item, i) => (
            <tr key={item.id} className="border-b border-[#eee] align-top" data-testid="invoice-line">
              <td className="py-2 px-2.5 text-center">{i + 1}</td>
              <td className="py-2 px-2.5 break-words whitespace-pre-line">{item.description}</td>
              <td className="py-2 px-2.5 text-right tabular-nums">{trimRate(item.quantity)}</td>
              <td className="py-2 px-2.5 text-right tabular-nums whitespace-nowrap">{money(item.unitPrice)}</td>
              <td className="py-2 px-2.5 text-right tabular-nums whitespace-nowrap">{money(item.lineTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }, (_, i) => (
            <tr key={`empty-${i}`} className="border-b border-[#eee] h-[25px]" aria-hidden>
              <td colSpan={5} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total in words | totals (under the Rate + Amount columns) */}
      <section className="flex flex-col sm:flex-row justify-between items-start gap-5 mb-5 break-inside-avoid print-row">
        <div className="w-full sm:flex-1 min-w-0">
          <div className="p-2.5 bg-[#f8f9fa] border-l-4" style={{ borderColor: NAVY }}>
            <p className="text-[8px] font-bold uppercase text-[#666] mb-0.5">Total in Words</p>
            <p className="italic text-[10px]" data-testid="total-in-words">
              {invoice.totalInWords}
            </p>
          </div>
        </div>
        <div className={`w-full ${TOTALS_WIDTH} shrink-0 font-semibold`}>
          <div className="flex justify-between gap-2 px-2.5 py-1">
            <span className="text-[#555]">Sub Total</span>
            <span className="tabular-nums" data-testid="subtotal">
              {money(invoice.subtotal)}
            </span>
          </div>
          <div className="flex justify-between gap-2 px-2.5 py-1">
            <span className="text-[#555]">GST ({trimRate(invoice.taxRate)}%)</span>
            <span className="tabular-nums" data-testid="tax-amount">
              {money(invoice.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between gap-2 px-2.5 py-1.5 mt-1 bg-[#f8f9fa] border-y-2 text-[13px] font-bold" style={{ borderColor: NAVY, color: NAVY }}>
            <span>Grand Total</span>
            <span className="tabular-nums" data-testid="grand-total">
              {money(invoice.total)}
            </span>
          </div>
          {livePayments.map(p => (
            <div key={p.id} className="flex justify-between gap-2 px-2.5 py-0.5 font-normal text-[#047857]" data-testid="payment-line">
              <span className="min-w-0">
                Paid {formatDate(p.txnDate)} ({p.paymentMethod})
              </span>
              <span className="tabular-nums whitespace-nowrap shrink-0">-{money(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 px-2.5 py-1 border-t border-dashed border-[#dee2e6]">
            <span className="text-[#555]">Balance Due</span>
            <span className="tabular-nums" data-testid="balance">
              {money(invoice.balance)}
            </span>
          </div>
        </div>
      </section>

      {/* Notes | bank details: side by side only when both exist */}
      {(invoice.notes || company.bankDetails) && (
        <section className={`grid grid-cols-1 gap-5 mt-5 break-inside-avoid ${sideBySide ? 'sm:grid-cols-2 print-row-grid' : ''}`}>
          {invoice.notes && (
            <div className="min-w-0">
              <p className={sectionHeading} style={{ color: NAVY }}>
                Notes
              </p>
              <p className="text-[10px] text-[#555] whitespace-pre-line break-words" data-testid="invoice-notes">
                {invoice.notes}
              </p>
            </div>
          )}
          {company.bankDetails && (
            <div className="min-w-0">
              <p className={sectionHeading} style={{ color: NAVY }}>
                Bank Details
              </p>
              <p className="text-[10px] whitespace-pre-line break-words">{company.bankDetails}</p>
            </div>
          )}
        </section>
      )}

      {company.terms && (
        <section className="mt-5 break-inside-avoid">
          <p className={sectionHeading} style={{ color: NAVY }}>
            Terms
          </p>
          <p className="text-[10px] text-[#555] whitespace-pre-line break-words">{company.terms}</p>
        </section>
      )}

      {/* Signature */}
      <div className="mt-10 flex justify-end break-inside-avoid">
        <div className="w-[220px] text-center">
          <p className="text-[9px] text-[#666] mb-1">For {company.companyName}</p>
          <div className="h-[60px] flex items-end justify-center">
            {company.signatureDataUrl && (
              <img src={company.signatureDataUrl} alt="" data-testid="invoice-signature" className="max-h-[60px] max-w-[200px] object-contain" />
            )}
          </div>
          <div className="border-t border-black mt-1 mb-1" />
          {company.signatoryName && (
            <p className="text-[10px] font-bold" data-testid="signatory-name">
              {company.signatoryName}
            </p>
          )}
          {company.signatoryDesignation && <p className="text-[9px] text-[#444]">{company.signatoryDesignation}</p>}
          <p className={company.signatoryName ? 'text-[9px] text-[#666]' : 'text-[10px] font-bold'}>Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
};
