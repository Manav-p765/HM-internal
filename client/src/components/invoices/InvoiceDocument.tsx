import React from 'react';
import { CompanySettings, Invoice, INVOICE_STATUS_LABEL, invoiceLabel } from '../../types/invoices';
import { formatDate } from '../../utils/formatters';
import { formatMoney, trimRate } from '../../utils/money';

// The printed invoice (/invoices/:id/print), laid out like the old invoice generator's "Tax Invoice"
// template: company block and title over a navy rule, invoice meta beside a "Balance Due" panel, a shaded
// "Bill To" box, the items table with a navy header (padded to five rows), total in words beside the totals,
// notes beside bank details, terms, and an "Authorized Signatory" line.
//
// Pure: everything comes from props. Company details, logo, bank details and terms come from company
// settings; every amount and the total in words are server strings (nothing is computed here). All text is
// rendered as React text nodes, so names, addresses and notes can never inject markup; the logo is a data
// URL the server has checked (PNG/JPEG/WebP only).
const NAVY = '#2c3e50';
const MIN_ROWS = 5;

export const InvoiceDocument: React.FC<{ invoice: Invoice; company: CompanySettings }> = ({ invoice, company }) => {
  const isDraft = invoice.status === 'draft';
  const title = isDraft ? 'Draft Invoice' : invoice.status === 'cancelled' ? 'Invoice (Cancelled)' : 'Tax Invoice';
  const livePayments = invoice.payments.filter(p => !p.reversedAt);
  const emptyRows = Math.max(0, MIN_ROWS - invoice.items.length);

  return (
    <div className="hm-invoice relative text-[11px] leading-[1.4] text-[#1a1a1a]" data-testid="invoice-document">
      {isDraft && (
        // Printed too: a draft has no number and is not a tax invoice.
        <div aria-hidden data-testid="draft-watermark" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="text-[96px] font-black tracking-[0.2em] text-[#E11D48]/10 -rotate-30 select-none">DRAFT</span>
        </div>
      )}

      {/* Header: company block | logo + title */}
      <header className="flex flex-col sm:flex-row justify-between gap-4 pb-2.5 mb-5 border-b-2 print-row" style={{ borderColor: NAVY }}>
        <div className="min-w-0 sm:w-[60%]">
          <h1 className="text-lg font-bold mb-1" style={{ color: NAVY }}>
            {company.companyName}
          </h1>
          {company.companyAddress && <p className="text-[10px] text-[#555] whitespace-pre-line mb-0.5">{company.companyAddress}</p>}
          {company.companyGstin && (
            <p className="text-[10px] text-[#555] mb-0.5">
              <strong>GSTIN:</strong> <span className="font-mono">{company.companyGstin}</span>
            </p>
          )}
          {company.companyEmail && <p className="text-[10px] text-[#555] mb-0.5">{company.companyEmail}</p>}
          {company.companyPhone && <p className="text-[10px] text-[#555]">{company.companyPhone}</p>}
        </div>
        <div className="sm:w-[40%] sm:text-right shrink-0">
          {company.logoDataUrl && (
            <img src={company.logoDataUrl} alt="" data-testid="invoice-logo" className="max-h-[70px] max-w-[200px] mb-2.5 sm:ml-auto object-contain" />
          )}
          <p className="text-2xl font-bold uppercase" style={{ color: NAVY }} data-testid="invoice-title">
            {title}
          </p>
        </div>
      </header>

      {/* Meta | balance due */}
      <section className="flex flex-col sm:flex-row justify-between gap-4 mb-5 print-row">
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 items-baseline">
          <dt className="font-bold text-[#666] text-[9px] uppercase">Invoice No:</dt>
          <dd className="font-medium font-mono" data-testid="invoice-number">
            {invoiceLabel(invoice)}
          </dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Invoice Date:</dt>
          <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Due Date:</dt>
          <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
          <dt className="font-bold text-[#666] text-[9px] uppercase">Status:</dt>
          <dd className="font-medium">{INVOICE_STATUS_LABEL[invoice.derivedStatus]}</dd>
        </dl>
        <div className="sm:text-right">
          <div className="inline-block text-white px-4 py-2 rounded text-right min-w-[150px]" style={{ background: NAVY }}>
            <p className="text-[8px] uppercase text-[#bdc3c7] mb-0.5">Balance Due</p>
            <p className="text-lg font-bold font-mono" data-testid="balance-due-panel">
              {formatMoney(invoice.balance)}
            </p>
          </div>
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
            <strong>GSTIN:</strong> <span className="font-mono">{invoice.clientGstin}</span>
          </p>
        )}
        {invoice.clientEmail && <p className="text-[10px] text-[#444]">{invoice.clientEmail}</p>}
      </section>

      {/* Items */}
      <table className="w-full border-collapse mb-5 table-fixed">
        <thead>
          <tr className="text-white text-[9px] font-bold uppercase" style={{ background: NAVY }}>
            <th className="w-10 py-2 px-2.5 text-center">#</th>
            <th className="py-2 px-2.5 text-left">Description</th>
            <th className="w-16 py-2 px-2.5 text-center">Qty</th>
            <th className="w-28 py-2 px-2.5 text-right">Rate (INR)</th>
            <th className="w-28 py-2 px-2.5 text-right">Amount (INR)</th>
          </tr>
        </thead>
        <tbody className="text-[10px]">
          {invoice.items.map((item, i) => (
            <tr key={item.id} className="border-b border-[#eee] align-top" data-testid="invoice-line">
              <td className="py-2 px-2.5 text-center">{i + 1}</td>
              <td className="py-2 px-2.5 break-words whitespace-pre-line">{item.description}</td>
              <td className="py-2 px-2.5 text-center font-mono">{trimRate(item.quantity)}</td>
              <td className="py-2 px-2.5 text-right font-mono whitespace-nowrap">{formatMoney(item.unitPrice)}</td>
              <td className="py-2 px-2.5 text-right font-mono whitespace-nowrap">{formatMoney(item.lineTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }, (_, i) => (
            <tr key={`empty-${i}`} className="border-b border-[#eee] h-[25px]" aria-hidden>
              <td colSpan={5} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total in words | totals */}
      <section className="flex flex-col sm:flex-row justify-between gap-5 mb-5 break-inside-avoid print-row">
        <div className="sm:w-1/2 min-w-0">
          <div className="p-2.5 bg-[#f8f9fa] border-l-4" style={{ borderColor: NAVY }}>
            <p className="text-[8px] font-bold uppercase text-[#666] mb-0.5">Total in Words</p>
            <p className="italic text-[10px]" data-testid="total-in-words">
              {invoice.totalInWords}
            </p>
          </div>
        </div>
        <div className="sm:w-[260px] shrink-0 space-y-0.5 font-bold">
          <div className="flex justify-between px-2.5 py-1">
            <span className="text-[#555]">Sub Total:</span>
            <span className="font-mono" data-testid="subtotal">
              {formatMoney(invoice.subtotal)}
            </span>
          </div>
          <div className="flex justify-between px-2.5 py-1">
            <span className="text-[#555]">GST ({trimRate(invoice.taxRate)}%):</span>
            <span className="font-mono" data-testid="tax-amount">
              {formatMoney(invoice.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between px-2.5 py-1.5 mt-1 bg-[#f8f9fa] border-y-2 text-[13px]" style={{ borderColor: NAVY, color: NAVY }}>
            <span>Grand Total:</span>
            <span className="font-mono" data-testid="grand-total">
              {formatMoney(invoice.total)}
            </span>
          </div>
          {livePayments.map(p => (
            <div key={p.id} className="flex justify-between gap-2 px-2.5 py-0.5 font-normal text-[#047857]" data-testid="payment-line">
              <span className="min-w-0">
                Paid {formatDate(p.txnDate)} ({p.paymentMethod})
              </span>
              <span className="font-mono whitespace-nowrap shrink-0">-{formatMoney(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between px-2.5 py-1 border-t border-dashed border-[#dee2e6]">
            <span className="text-[#555]">Balance Due:</span>
            <span className="font-mono" data-testid="balance">
              {formatMoney(invoice.balance)}
            </span>
          </div>
        </div>
      </section>

      {/* Notes | bank details */}
      {(invoice.notes || company.bankDetails) && (
        <section className="flex flex-col sm:flex-row gap-5 mt-5 break-inside-avoid print-row">
          <div className="sm:w-1/2 min-w-0">
            {invoice.notes && (
              <>
                <p className="text-[10px] font-bold uppercase mb-1 border-b border-[#dee2e6]" style={{ color: NAVY }}>
                  Notes
                </p>
                <p className="text-[10px] text-[#555] whitespace-pre-line break-words" data-testid="invoice-notes">
                  {invoice.notes}
                </p>
              </>
            )}
          </div>
          <div className="sm:w-1/2 min-w-0">
            {company.bankDetails && (
              <>
                <p className="text-[10px] font-bold uppercase mb-1 border-b border-[#dee2e6]" style={{ color: NAVY }}>
                  Bank Details
                </p>
                <p className="text-[10px] whitespace-pre-line break-words">{company.bankDetails}</p>
              </>
            )}
          </div>
        </section>
      )}

      {company.terms && (
        <section className="mt-5 break-inside-avoid">
          <p className="text-[10px] font-bold uppercase mb-1 border-b border-[#dee2e6]" style={{ color: NAVY }}>
            Terms
          </p>
          <p className="text-[10px] text-[#555] whitespace-pre-line break-words">{company.terms}</p>
        </section>
      )}

      {/* Signature */}
      <div className="mt-10 flex justify-end break-inside-avoid">
        <div className="w-[200px] text-center">
          <div className="border-t border-black mb-1" />
          <p className="text-[10px] font-bold">Authorized Signatory</p>
          <p className="text-[9px] text-[#666]">{company.companyName}</p>
        </div>
      </div>
    </div>
  );
};
