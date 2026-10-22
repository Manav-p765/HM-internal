import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { portalApi } from '../../api/portal';
import { useApiData } from '../../api/useApiData';
import { LoadError } from '../common/LoadError';
import { Button } from '../common/Button';
import { InvoiceStatusBadge } from '../invoices/InvoiceStatusBadge';
import { InvoiceDocument } from '../invoices/InvoiceDocument';
import { formatDate } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';
import type { CurrencyTotals, PortalInvoicesResponse } from '../../types/invoices';

// A summary figure in each currency the company is billed in, one per line (INR first, if it has any;
// currencies are never added together). Nothing due at all: "₹0.00", or the zero of the only other currency.
const PortalTotals: React.FC<{ summary: PortalInvoicesResponse['summary']; field: 'outstandingTotal' | 'overdueTotal'; className: string }> = ({
  summary,
  field,
  className,
}) => {
  const all: CurrencyTotals[] = [{ currency: 'INR', outstandingTotal: summary.outstandingTotal, overdueTotal: summary.overdueTotal }, ...summary.otherCurrencies];
  const due = all.filter(r => r[field] !== '0.00');
  const shown = due.length > 0 ? due : [summary.otherCurrencies.length === 1 && summary.outstandingTotal === '0.00' ? summary.otherCurrencies[0] : all[0]];
  return (
    <div className={`mt-1 font-mono font-bold ${className}`} data-testid={`portal-${field}`}>
      {shown.map(r => (
        <div key={r.currency} className="text-2xl">
          {formatMoney(r[field], r.currency)}
        </div>
      ))}
    </div>
  );
};

// /portal/invoices: the client company's own issued invoices (never drafts), newest first. Read-only; every
// amount and status is a server value from /api/portal/invoices.
export const PortalInvoicesView: React.FC = () => {
  const { data, error, isLoading, reload } = useApiData(() => portalApi.invoices(), []);
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#111827]">Invoices</h1>
        <p className="text-xs text-[#7185A5] mt-1">Every invoice issued to your company. Open one to view, print or save it as a PDF.</p>
      </div>

      {summary && summary.count > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="portal-invoice-summary">
          <div className="bg-white rounded-xl border border-[#DFE6F1] p-4">
            <span className="text-xs font-semibold text-[#7185A5]">Invoices</span>
            <div className="text-2xl font-mono font-bold text-[#111827] mt-1">{summary.count}</div>
          </div>
          <div className="bg-white rounded-xl border border-[#DFE6F1] p-4">
            <span className="text-xs font-semibold text-[#7185A5]">Balance due</span>
            <PortalTotals summary={summary} field="outstandingTotal" className="text-[#B45309]" />
          </div>
          <div className="bg-white rounded-xl border border-[#DFE6F1] p-4">
            <span className="text-xs font-semibold text-[#7185A5]">Overdue</span>
            <PortalTotals summary={summary} field="overdueTotal" className="text-[#E11D48]" />
            <p className="text-[11px] text-[#7185A5] mt-0.5">
              {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'} past the due date
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl border border-[#DFE6F1]">
          <LoadError message={error} onRetry={reload} />
        </div>
      ) : isLoading && !data ? (
        <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoices…</div>
      ) : data!.invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#DFE6F1] p-12 text-center text-[#7185A5]">
          <FileText className="w-10 h-10 mx-auto text-[#CBD5E1] mb-2" />
          <h3 className="font-semibold text-sm text-[#111827]">No invoices yet</h3>
          <p className="text-xs mt-1">Invoices appear here once they are issued to your company.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DFE6F1] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#7185A5] border-b border-[#DFE6F1]">
                <th className="py-3 px-4">Invoice</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Due</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {data!.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-[#F7F9FC]" data-testid="portal-invoice-row">
                  <td className="py-3 px-4">
                    <Link to={`/portal/invoices/${inv.id}`} className="font-mono font-bold text-[#5038F5] hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-[#475569]">{formatDate(inv.invoiceDate)}</td>
                  <td className="py-3 px-4 text-[#475569]">{formatDate(inv.dueDate)}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#111827]">{formatMoney(inv.total, inv.currency)}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#111827]">{inv.status === 'cancelled' ? '—' : formatMoney(inv.balance, inv.currency)}</td>
                  <td className="py-3 px-4">
                    <InvoiceStatusBadge status={inv.derivedStatus} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// /portal/invoices/:id: the invoice exactly as printed (the same InvoiceDocument staff print), with Print and
// "Save as PDF" (the browser's print dialog; the portal chrome is hidden when printing).
export const PortalInvoiceView: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useApiData(() => portalApi.invoice(id), [id]);
  const invoice = data?.invoice;

  // The document title is the browser's suggested PDF file name.
  useEffect(() => {
    if (!invoice) return;
    const previous = document.title;
    document.title = `${invoice.invoiceNumber} - ${invoice.clientName}`;
    return () => {
      document.title = previous;
    };
  }, [invoice]);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoice…</div>;

  return (
    <div className="invoice-print-root">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/portal/invoices')}>
          All invoices
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7185A5] hidden sm:inline">A4 · choose "Save as PDF" in the print dialog</span>
          <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="primary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>
      </div>
      <article className="invoice-sheet relative bg-white mx-auto border border-[#DFE6F1] shadow-sm" data-testid="invoice-sheet">
        <InvoiceDocument invoice={data.invoice} company={data.company} />
      </article>
    </div>
  );
};
