import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { invoicesApi } from '../../api/invoices';
import { invoiceLabel } from '../../types/invoices';
import { settingsApi } from '../../api/settings';
import { useApiData } from '../../api/useApiData';
import { LoadError } from '../common/LoadError';
import { Button } from '../common/Button';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { formatMoney, trimRate } from '../../utils/money';

// /invoices/:id/print: a clean A4 invoice from company settings, the client snapshot, the items and the
// server totals. When printing, the app chrome (sidebar, top bar, footer, this toolbar) is hidden by the
// `.no-print` / `.invoice-print-*` rules in index.css; "Save as PDF" is the browser's print dialog.
export const InvoicePrintView: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useApiData(() => Promise.all([invoicesApi.get(id), settingsApi.company()]), [id]);

  if (data.error) return <LoadError message={data.error} onRetry={data.reload} />;
  if (!data.data) return <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoice…</div>;
  const [{ invoice }, company] = data.data;
  const isTaxInvoice = invoice.status !== 'draft' && invoice.status !== 'cancelled';

  return (
    <div className="invoice-print-root">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate(`/invoices/${invoice.id}`)}>
          Back to invoice
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7185A5] hidden sm:inline">A4 · use "Save as PDF" in the print dialog</span>
          <Button variant="primary" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="invoice-sheet relative bg-white text-[#111827] mx-auto border border-[#DFE6F1] shadow-sm" data-testid="invoice-sheet">
        {invoice.status === 'draft' && (
          // Printed too: a draft has no number and is not a tax invoice.
          <div
            aria-hidden
            data-testid="draft-watermark"
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            <span className="text-[96px] font-black tracking-[0.2em] text-[#E11D48]/10 -rotate-30 select-none">DRAFT</span>
          </div>
        )}
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-[#DFE6F1]">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{company.companyName}</h1>
            {company.companyAddress && <p className="text-xs text-[#475569] whitespace-pre-line mt-1">{company.companyAddress}</p>}
            <p className="text-xs text-[#475569] mt-1">{[company.companyEmail, company.companyPhone].filter(Boolean).join(' · ')}</p>
            {company.companyGstin && <p className="text-xs font-mono text-[#475569]">GSTIN: {company.companyGstin}</p>}
          </div>
          <div className="sm:text-right shrink-0">
            <p className="text-xs uppercase font-bold tracking-wider text-[#5038F5]">{isTaxInvoice ? 'Tax Invoice' : invoice.status === 'draft' ? 'Draft Invoice' : 'Invoice (Cancelled)'}</p>
            <p className="text-lg font-mono font-bold">{invoiceLabel(invoice)}</p>
            <div className="text-xs text-[#475569] mt-2 space-y-0.5">
              <div>
                Invoice date: <span className="font-medium text-[#111827]">{formatDate(invoice.invoiceDate)}</span>
              </div>
              <div>
                Due date: <span className="font-medium text-[#111827]">{formatDate(invoice.dueDate)}</span>
              </div>
            </div>
            <div className="mt-2 print-status">
              <InvoiceStatusBadge status={invoice.derivedStatus} />
            </div>
          </div>
        </header>

        {/* Billed to */}
        <section className="py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7185A5] mb-1">Billed to</p>
          <p className="font-semibold text-sm">{invoice.clientName}</p>
          {invoice.clientAddress && <p className="text-xs text-[#475569] whitespace-pre-line">{invoice.clientAddress}</p>}
          {invoice.clientEmail && <p className="text-xs text-[#475569]">{invoice.clientEmail}</p>}
          {invoice.clientGstin && <p className="text-xs font-mono text-[#475569]">GSTIN: {invoice.clientGstin}</p>}
        </section>

        {/* Items */}
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-y border-[#DFE6F1] bg-[#F7F9FC] text-[#475569]">
              <th className="py-2 px-2 w-8">#</th>
              <th className="py-2 px-2">Description</th>
              <th className="py-2 px-2 text-right">Qty</th>
              <th className="py-2 px-2 text-right">Unit price</th>
              <th className="py-2 px-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id} className="border-b border-[#EEF2F7] align-top">
                <td className="py-2 px-2 text-[#7185A5]">{i + 1}</td>
                <td className="py-2 px-2">{item.description}</td>
                <td className="py-2 px-2 text-right font-mono">{trimRate(item.quantity)}</td>
                <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{formatMoney(item.unitPrice)}</td>
                <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals + payments summary */}
        <section className="flex flex-col sm:flex-row justify-between gap-6 pt-5 print-row">
          <div className="text-xs text-[#475569] space-y-3 sm:max-w-[55%] min-w-0">
            {company.bankDetails && (
              <div>
                <p className="font-semibold text-[#111827] mb-0.5">Bank details</p>
                <p className="whitespace-pre-line font-mono text-[11px]">{company.bankDetails}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <p className="font-semibold text-[#111827] mb-0.5">Notes</p>
                <p className="whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
          </div>
          <div className="sm:w-64 shrink-0 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#475569]">Subtotal</span>
              <span className="font-mono">{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#475569]">GST @ {trimRate(invoice.taxRate)}%</span>
              <span className="font-mono">{formatMoney(invoice.taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-[#111827]">
              <span>Total (INR)</span>
              <span className="font-mono">{formatMoney(invoice.total)}</span>
            </div>
            {invoice.payments.some(p => !p.reversedAt) && (
              <>
                {invoice.payments.filter(p => !p.reversedAt).map(p => (
                  <div key={p.id} className="flex justify-between gap-2 text-[#047857]">
                    <span className="min-w-0">
                      Paid {formatDate(p.txnDate)} ({p.paymentMethod})
                    </span>
                    <span className="font-mono whitespace-nowrap shrink-0">-{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between font-bold pt-1 border-t border-dashed border-[#DFE6F1]">
              <span>Balance due</span>
              <span className="font-mono">{formatMoney(invoice.balance)}</span>
            </div>
          </div>
        </section>

        {company.terms && (
          <footer className="mt-8 pt-4 border-t border-[#DFE6F1] text-[11px] text-[#475569]">
            <p className="font-semibold text-[#111827] mb-0.5">Terms</p>
            <p className="whitespace-pre-line">{company.terms}</p>
          </footer>
        )}
      </article>
    </div>
  );
};
