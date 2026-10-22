import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useApp } from '../../context/AppContext';
import { invoicesApi } from '../../api/invoices';
import { useApiData } from '../../api/useApiData';
import { errorMessage } from '../../api/client';
import { InvoiceListStatus, InvoiceSummaryRow, INVOICE_STATUS_LABEL, invoiceLabel } from '../../types/invoices';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { InvoiceModal } from './InvoiceModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { OtherCurrencyTotals } from './OtherCurrencyTotals';
import { FileText, Plus, Download, Search, Eye, Edit2, Trash2, Printer } from 'lucide-react';
import { formatDate, exportToCSV } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

const PAGE_SIZE = 25;

const STATUS_FILTERS: { value: '' | InvoiceListStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: INVOICE_STATUS_LABEL.draft },
  { value: 'sent', label: INVOICE_STATUS_LABEL.sent },
  { value: 'outstanding', label: 'Outstanding (sent, unpaid)' },
  { value: 'partially_paid', label: INVOICE_STATUS_LABEL.partially_paid },
  { value: 'overdue', label: INVOICE_STATUS_LABEL.overdue },
  { value: 'paid', label: INVOICE_STATUS_LABEL.paid },
  { value: 'cancelled', label: INVOICE_STATUS_LABEL.cancelled },
];

// /invoices                 list
// /invoices/new             list + create form
// /invoices/:id             list + detail (loads its own record, so deep links work)
// /invoices/:id/edit        list + edit form
// (/invoices/:id/print is its own page: InvoicePrintView)
export const InvoicesView: React.FC = () => {
  const { showToast } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id: routeId } = useParams();
  const isNew = pathname === '/invoices/new';
  const editId = routeId && pathname.endsWith('/edit') ? routeId : null;
  const viewId = routeId && !editId ? routeId : null;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // ?status=overdue (from the notification bell) preselects the filter.
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';
  const [status, setStatus] = useState<'' | InvoiceListStatus>(
    STATUS_FILTERS.some(f => f.value === initialStatus) ? (initialStatus as InvoiceListStatus) : '',
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [toDelete, setToDelete] = useState<InvoiceSummaryRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const list = useApiData(
    () => invoicesApi.list({ search, status: status || undefined, from: from || undefined, to: to || undefined, limit: PAGE_SIZE, offset }),
    [search, status, from, to, offset],
  );
  const invoices = list.data?.invoices ?? [];
  const summary = list.data?.summary;
  const total = list.data?.total ?? 0;

  const handleExportCSV = () => {
    const headers = ['Invoice Number', 'Client', 'Invoice Date', 'Due Date', 'Currency', 'Subtotal', 'Tax Rate (%)', 'Tax', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = invoices.map(i => [
      invoiceLabel(i),
      i.clientName,
      i.invoiceDate,
      i.dueDate,
      i.currency,
      i.subtotal,
      i.taxRate,
      i.taxAmount,
      i.total,
      i.amountPaid,
      i.balance,
      INVOICE_STATUS_LABEL[i.derivedStatus],
    ]);
    exportToCSV('invoices', headers, rows);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await invoicesApi.remove(toDelete.id);
      showToast('info', 'Draft deleted');
      setToDelete(null);
      if (viewId === toDelete.id) navigate('/invoices');
      list.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  const filterClass = 'w-full min-w-0 text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Invoices & Client Billing</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Issue GST invoices, send them, and track incoming payments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCSV} disabled={invoices.length === 0}>
            Export CSV
          </Button>
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/invoices/new')}>
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Summary over all invoices (server-computed) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Outstanding</span>
          <span className="mt-2 block text-lg sm:text-xl font-mono font-bold text-[#B45309] truncate" data-testid="summary-outstanding">
            {summary ? formatMoney(summary.outstandingTotal) : '—'}
          </span>
          <OtherCurrencyTotals rows={summary?.otherCurrencies} field="outstandingTotal" />
          <span className="text-[11px] text-[#7185A5]">Sent invoices not yet paid</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Overdue</span>
          <span className="mt-2 block text-lg sm:text-xl font-mono font-bold text-[#E11D48] truncate">
            {summary ? formatMoney(summary.overdueTotal) : '—'}
          </span>
          <OtherCurrencyTotals rows={summary?.otherCurrencies} field="overdueTotal" />
          <span className="text-[11px] text-[#7185A5]">{summary ? `${summary.overdueCount} past due date` : ''}</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Collected This Month</span>
          <span className="mt-2 block text-lg sm:text-xl font-mono font-bold text-[#047857] truncate">
            {summary ? formatMoney(summary.collectedThisMonth) : '—'}
          </span>
          <span className="text-[11px] text-[#7185A5]">Invoice payments received, in INR</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Drafts</span>
          <span className="mt-2 block text-lg sm:text-xl font-mono font-bold text-[#111827]">{summary ? summary.draftCount : '—'}</span>
          <span className="text-[11px] text-[#7185A5]">Not sent yet</span>
        </Card>
      </div>

      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice # or client..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className={`${filterClass} pl-9`}
              aria-label="Search invoices"
            />
          </div>
          <select
            value={status}
            onChange={e => {
              setStatus(e.target.value as '' | InvoiceListStatus);
              setOffset(0);
            }}
            className={filterClass}
            aria-label="Status"
          >
            {STATUS_FILTERS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-1 sm:col-span-2 lg:col-span-2">
            <input
              type="date"
              value={from}
              onChange={e => {
                setFrom(e.target.value);
                setOffset(0);
              }}
              className={filterClass}
              aria-label="Invoice date from"
              title="Invoice date from"
            />
            <input
              type="date"
              value={to}
              onChange={e => {
                setTo(e.target.value);
                setOffset(0);
              }}
              className={filterClass}
              aria-label="Invoice date to"
              title="Invoice date to"
            />
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : list.isLoading && !list.data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No invoices found"
            description="No invoices match this search or filter."
            actionLabel="Create Invoice"
            onAction={() => navigate('/invoices/new')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-[#F7F9FC]/60 transition-colors" data-testid={`invoice-row-${inv.invoiceNumber ?? inv.id}`}>
                    <td className="py-3 px-4 font-mono font-bold text-[#111827] whitespace-nowrap">{invoiceLabel(inv)}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#111827]">{inv.clientName || '—'}</div>
                      {inv.clientEmail && <div className="text-[11px] text-[#7185A5]">{inv.clientEmail}</div>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-[#111827]">{formatDate(inv.invoiceDate)}</div>
                      <div className={`text-[11px] ${inv.derivedStatus === 'overdue' ? 'text-[#E11D48] font-semibold' : 'text-[#7185A5]'}`}>
                        Due {formatDate(inv.dueDate)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#111827] whitespace-nowrap">{formatMoney(inv.total, inv.currency)}</td>
                    <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                      <span className={inv.status === 'sent' ? 'font-bold text-[#B45309]' : 'text-[#7185A5]'}>{formatMoney(inv.balance, inv.currency)}</span>
                      {inv.amountPaid !== '0.00' && <div className="text-[11px] text-[#047857]">Paid {formatMoney(inv.amountPaid, inv.currency)}</div>}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <InvoiceStatusBadge status={inv.derivedStatus} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          aria-label={`View ${invoiceLabel(inv)}`}
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/invoices/${inv.id}/print`)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          aria-label={`Print ${invoiceLabel(inv)}`}
                          title="Print / Save as PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {(inv.status === 'draft' || inv.status === 'sent') && (
                          <button
                            onClick={() => navigate(`/invoices/${inv.id}/edit`)}
                            className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            aria-label={`Edit ${invoiceLabel(inv)}`}
                            title={inv.status === 'draft' ? 'Edit draft' : 'Edit due date / notes'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {inv.status === 'draft' && (
                          <button
                            onClick={() => setToDelete(inv)}
                            className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            aria-label={`Delete draft ${invoiceLabel(inv)}`}
                            title="Delete draft"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <InvoiceModal
        isOpen={isNew || Boolean(editId)}
        invoiceId={editId}
        onClose={() => navigate(editId ? `/invoices/${editId}` : '/invoices')}
        onSaved={invoice => {
          list.reload();
          navigate(`/invoices/${invoice.id}`);
        }}
      />

      {viewId && (
        <InvoiceDetailModal
          invoiceId={viewId}
          onClose={() => navigate('/invoices')}
          onChanged={() => list.reload()}
          onDeleted={() => {
            list.reload();
            navigate('/invoices');
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Draft"
        message={`Delete the draft for ${toDelete?.clientName || 'no client'}? Only drafts can be deleted; this cannot be undone.`}
        confirmLabel="Delete Draft"
        isDestructive
      />
    </div>
  );
};
