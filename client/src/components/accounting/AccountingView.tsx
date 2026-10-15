import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { transactionsApi, LedgerFilters } from '../../api/transactions';
import { useApiData } from '../../api/useApiData';
import { LedgerRow, PERIOD_PRESET_LABEL, PERIOD_PRESETS, PeriodPreset, TxnSource, TxnType } from '../../types/ledger';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ReasonDialog } from '../common/ReasonDialog';
import { TransactionModal } from './TransactionModal';
import { CategoriesManager } from './CategoriesManager';
import { Ban, Download, Edit2, Plus, Search, Tags, WalletCards } from 'lucide-react';
import { formatDate, formatDateIst, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

const PAGE_SIZE = 50;
const selectClass = 'text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] min-w-0';

type PeriodChoice = 'all' | PeriodPreset | 'custom';

// Source badge: Manual, or a link to the invoice / salary month that owns the row.
const SourceBadge: React.FC<{ row: LedgerRow }> = ({ row }) => {
  if (row.source === 'invoice' && row.invoiceId) {
    return (
      <Link to={`/invoices/${row.invoiceId}`} className="inline-flex" title="Open the invoice" data-testid="source-link">
        <Badge variant="purple" size="sm">
          Invoice {row.invoiceNumber}
        </Badge>
      </Link>
    );
  }
  if (row.source === 'salary' && row.salaryMonth) {
    return (
      <Link to={`/salary?month=${row.salaryMonth}`} className="inline-flex" title={`Salary of ${row.salaryEmployeeName ?? ''}`} data-testid="source-link">
        <Badge variant="info" size="sm">
          Salary {formatMonthYear(row.salaryMonth)}
        </Badge>
      </Link>
    );
  }
  return (
    <Badge variant="neutral" size="sm">
      Manual
    </Badge>
  );
};

const signed = (row: LedgerRow) => `${row.type === 'income' ? '+' : '−'}${formatMoney(row.amount)}`;

// /accounting (admin): the server ledger. Every money movement is listed; invoice and salary payments are
// linked rows (changed only on their own pages); manual rows are added, edited and voided here. Totals come
// from the server for the whole filtered set and never include voided rows. /accounting/new opens the form.
export const AccountingView: React.FC = () => {
  const { showToast } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const creating = pathname === '/accounting/new';

  const [type, setType] = useState<'' | TxnType>('');
  const [category, setCategory] = useState('');
  const [source, setSource] = useState<'' | TxnSource>('');
  const [period, setPeriod] = useState<PeriodChoice>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<LedgerRow | null>(null);
  const [toVoid, setToVoid] = useState<LedgerRow | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: LedgerFilters = {
    type: type || undefined,
    category: category || undefined,
    source: source || undefined,
    search: search || undefined,
    includeVoided: includeVoided || undefined,
    ...(period === 'custom' ? { from: from || undefined, to: to || undefined } : period === 'all' ? {} : { preset: period }),
  };
  const key = JSON.stringify(filters);
  useEffect(() => setOffset(0), [key]);

  const list = useApiData(() => transactionsApi.list({ ...filters, limit: PAGE_SIZE, offset }), [key, offset]);
  const categories = useApiData(() => transactionsApi.categories(), []);
  const data = list.data;
  const today = data?.today ?? '';

  const exportHref = transactionsApi.exportUrl(filters);

  const handleVoid = async (reason: string) => {
    if (!toVoid) return;
    await transactionsApi.void(toVoid.id, reason);
    showToast('info', 'Transaction voided');
    setToVoid(null);
    await list.reload();
  };

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Accounting & Ledger</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Every income and expense, including invoice and salary payments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={<Tags className="w-3.5 h-3.5" />} onClick={() => setCategoriesOpen(true)}>
            Categories
          </Button>
          <a
            href={exportHref}
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[#DFE6F1] bg-white text-[#111827] hover:bg-[#F8FAFC]"
            data-testid="export-csv"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/accounting/new')}>
            Add transaction
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2" aria-label="Filters">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search description or reference…"
              className="w-full text-xs pl-9 pr-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              aria-label="Search transactions"
            />
          </div>
          <select value={type} onChange={e => setType(e.target.value as '' | TxnType)} className={selectClass} aria-label="Type filter">
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} className={selectClass} aria-label="Category filter">
            <option value="">All categories</option>
            {(categories.data ?? [])
              .filter(c => !type || c.type === type)
              .map(c => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.active ? '' : ' (inactive)'}
                </option>
              ))}
          </select>
          <select value={source} onChange={e => setSource(e.target.value as '' | TxnSource)} className={selectClass} aria-label="Source filter">
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="invoice">Invoice payments</option>
            <option value="salary">Salary payments</option>
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value as PeriodChoice)} className={selectClass} aria-label="Period filter">
            <option value="all">All dates</option>
            {PERIOD_PRESETS.map(p => (
              <option key={p} value={p}>
                {PERIOD_PRESET_LABEL[p]}
              </option>
            ))}
            <option value="custom">Custom range…</option>
          </select>
          {period === 'custom' && (
            <span className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selectClass} aria-label="From date" />
              <span className="text-xs text-[#7185A5]">to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selectClass} aria-label="To date" />
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[#475569] cursor-pointer select-none">
            <input type="checkbox" checked={includeVoided} onChange={e => setIncludeVoided(e.target.checked)} aria-label="Show voided" />
            Show voided
          </label>
        </div>
      </Card>

      {/* Totals for the filtered set (server) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="ledger-totals">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Income</span>
          <span className="text-sm sm:text-2xl font-mono font-bold text-[#047857] block mt-2 whitespace-nowrap" data-testid="total-income">
            {data ? formatMoney(data.totals.income) : '—'}
          </span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Expenses</span>
          <span className="text-sm sm:text-2xl font-mono font-bold text-[#B45309] block mt-2 whitespace-nowrap" data-testid="total-expense">
            {data ? formatMoney(data.totals.expense) : '—'}
          </span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Net</span>
          <span
            className={`text-sm sm:text-2xl font-mono font-bold block mt-2 whitespace-nowrap ${data?.totals.net.startsWith('-') ? 'text-[#E11D48]' : 'text-[#111827]'}`}
            data-testid="total-net"
          >
            {data ? formatMoney(data.totals.net) : '—'}
          </span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Entries counted</span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-[#111827] block mt-2">{data ? data.totals.count : '—'}</span>
          {data?.period.from && (
            <span className="text-[11px] text-[#7185A5]">
              {formatDate(data.period.from)} – {formatDate(data.period.to ?? '')}
            </span>
          )}
        </Card>
      </div>

      {/* Rows */}
      <Card padding="none" className="overflow-hidden">
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : !data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading transactions…</div>
        ) : data.transactions.length === 0 ? (
          <EmptyState
            icon={<WalletCards className="w-6 h-6" />}
            title="No transactions"
            description="Nothing matches these filters."
            actionLabel="Add transaction"
            onAction={() => navigate('/accounting/new')}
          />
        ) : (
          <>
            {/* Table (md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="ledger-table">
                <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                  <tr>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {data.transactions.map(row => (
                    <tr key={row.id} className={row.voidedAt ? 'bg-[#F7F9FC]/70 text-[#94A3B8]' : 'hover:bg-[#F7F9FC]/60'} data-testid={`ledger-row-${row.id}`} data-voided={row.voidedAt ? 'true' : undefined}>
                      <td className={`py-3 px-3 whitespace-nowrap ${row.voidedAt ? 'line-through' : 'text-[#475569]'}`}>{formatDate(row.txnDate)}</td>
                      <td className="py-3 px-3 max-w-[22rem]">
                        <div className={`font-medium ${row.voidedAt ? 'line-through' : 'text-[#111827]'}`}>{row.description}</div>
                        {(row.referenceNumber || row.notes) && (
                          <div className="text-[10px] text-[#7185A5] truncate">{[row.referenceNumber, row.notes].filter(Boolean).join(' · ')}</div>
                        )}
                        {row.voidedAt && (
                          <div className="text-[10px] text-[#7185A5] no-underline" data-testid="void-info">
                            {row.source === 'manual' ? 'Voided' : 'Reversed'} by {row.voidedByName ?? 'unknown'} on {formatDateIst(row.voidedAt)}: {row.voidReason}
                          </div>
                        )}
                      </td>
                      <td className={`py-3 px-3 ${row.voidedAt ? 'line-through' : 'text-[#475569]'}`}>{row.category}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <SourceBadge row={row} />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-[#7185A5]">{row.paymentMethod}</td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold whitespace-nowrap ${
                          row.voidedAt ? 'line-through' : row.type === 'income' ? 'text-[#047857]' : 'text-[#111827]'
                        }`}
                      >
                        {signed(row)}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <RowActions row={row} onEdit={() => setEditing(row)} onVoid={() => setToVoid(row)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards (small screens) */}
            <ul className="md:hidden divide-y divide-[#DFE6F1]" data-testid="ledger-cards">
              {data.transactions.map(row => (
                <li key={row.id} className={`p-3 text-xs ${row.voidedAt ? 'bg-[#F7F9FC]/70 text-[#94A3B8]' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`font-medium break-words ${row.voidedAt ? 'line-through' : 'text-[#111827]'}`}>{row.description}</div>
                      <div className="text-[11px] text-[#7185A5] mt-0.5">
                        {formatDate(row.txnDate)} · {row.category} · {row.paymentMethod}
                      </div>
                    </div>
                    <span className={`font-mono font-semibold whitespace-nowrap ${row.voidedAt ? 'line-through' : row.type === 'income' ? 'text-[#047857]' : 'text-[#111827]'}`}>
                      {signed(row)}
                    </span>
                  </div>
                  {row.voidedAt && (
                    <div className="text-[10px] text-[#7185A5] mt-1">
                      {row.source === 'manual' ? 'Voided' : 'Reversed'} by {row.voidedByName ?? 'unknown'} on {formatDateIst(row.voidedAt)}: {row.voidReason}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <SourceBadge row={row} />
                    <RowActions row={row} onEdit={() => setEditing(row)} onVoid={() => setToVoid(row)} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
                <span>
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {formOpen && today && (
        <TransactionModal
          existing={editing}
          today={today}
          onClose={() => {
            setEditing(null);
            if (creating) navigate('/accounting');
          }}
          onSaved={() => {
            setEditing(null);
            if (creating) navigate('/accounting');
            list.reload();
          }}
        />
      )}
      {toVoid && (
        <ReasonDialog
          title="Void transaction"
          message={`Void "${toVoid.description}" (${signed(toVoid)}, ${formatDate(toVoid.txnDate)})? It stays in the ledger, struck through, and no longer counts in any total.`}
          confirmLabel="Void"
          reasonLabel="Reason for voiding"
          onClose={() => setToVoid(null)}
          onConfirm={handleVoid}
        />
      )}
      {categoriesOpen && (
        <CategoriesManager
          onClose={() => setCategoriesOpen(false)}
          onChanged={() => {
            categories.reload();
            list.reload();
          }}
        />
      )}
    </div>
  );
};

// Manual rows: Edit and Void. Linked rows: nothing here (they change on the invoice or salary page).
const RowActions: React.FC<{ row: LedgerRow; onEdit: () => void; onVoid: () => void }> = ({ row, onEdit, onVoid }) => {
  if (row.voidedAt) return <span className="text-[10px] font-semibold uppercase tracking-wider">{row.source === 'manual' ? 'Voided' : 'Reversed'}</span>;
  if (row.source !== 'manual') return <span className="text-[10px] text-[#94A3B8]">Linked</span>;
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={onEdit} className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer" aria-label={`Edit ${row.description}`}>
        <Edit2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={onVoid} className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#E11D48]/10 rounded cursor-pointer" aria-label={`Void ${row.description}`}>
        <Ban className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
