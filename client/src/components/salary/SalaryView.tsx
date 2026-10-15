import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { salaryApi } from '../../api/salary';
import { useApiData } from '../../api/useApiData';
import { errorMessage } from '../../api/client';
import { SalaryRow, SalaryStatus } from '../../types/salary';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { SalaryDetailModal } from './SalaryDetailModal';
import { SalaryStatusBadge } from './SalaryStatusBadge';
import { Banknote, Plus, Search, Calendar, ChevronLeft, ChevronRight, FileCheck2, SlidersHorizontal } from 'lucide-react';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

// 'YYYY-MM' n months later (calendar navigation only).
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// /salary (admin). One month at a time; every amount and total comes from the server. The month defaults to
// the current IST month as reported by the API.
export const SalaryView: React.FC = () => {
  const { showToast } = useApp();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const list = useApiData(() => salaryApi.list(month), [month]);
  const currentMonth = list.data?.month ?? month ?? '';

  const [statusFilter, setStatusFilter] = useState<'all' | SalaryStatus>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data?.salaries ?? []).filter(
      s =>
        (statusFilter === 'all' || s.status === statusFilter) &&
        (!q || s.employeeName.toLowerCase().includes(q) || s.employeeCode.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)),
    );
  }, [list.data, statusFilter, search]);

  const handleGenerate = async () => {
    if (!currentMonth) return;
    setIsGenerating(true);
    try {
      const result = await salaryApi.generate(currentMonth);
      showToast(
        result.created > 0 ? 'success' : 'info',
        result.created > 0
          ? `Created ${result.created} salary row${result.created === 1 ? '' : 's'} for ${formatMonthYear(currentMonth)}${result.skipped ? ` (${result.skipped} already existed)` : ''}`
          : `Every eligible employee already has a row for ${formatMonthYear(currentMonth)}`,
      );
      await list.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const summary = list.data?.summary;
  const canGenerate = list.data?.canGenerate ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Salary & Monthly Payroll</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Generate a monthly run, itemise adjustments, pay salaries and publish payslips</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={handleGenerate}
          disabled={!list.data || !canGenerate || isGenerating}
          title={canGenerate ? undefined : 'Runs can be generated at most one month ahead'}
        >
          {isGenerating ? 'Generating…' : `Generate run for ${currentMonth ? formatMonthYear(currentMonth) : '…'}`}
        </Button>
      </div>

      {/* Month and filters */}
      <Card padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-[#5038F5] shrink-0" />
            <span className="text-xs font-semibold text-[#111827] shrink-0">Payroll month</span>
            <button
              onClick={() => currentMonth && setMonth(shiftMonth(currentMonth, -1))}
              className="p-1.5 rounded-lg border border-[#DFE6F1] text-[#7185A5] hover:text-[#5038F5] cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="month"
              value={currentMonth}
              onChange={e => e.target.value && setMonth(e.target.value)}
              className="text-xs font-semibold px-2 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] min-w-0"
              aria-label="Payroll month"
            />
            <button
              onClick={() => currentMonth && setMonth(shiftMonth(currentMonth, 1))}
              className="p-1.5 rounded-lg border border-[#DFE6F1] text-[#7185A5] hover:text-[#5038F5] cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-56">
              <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, code, department…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                aria-label="Search salaries"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | SalaryStatus)}
              className="text-xs px-2 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              aria-label="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Summary (server totals for the whole month) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="salary-summary">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Total payable</span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-[#111827] block mt-2 break-all">{summary ? formatMoney(summary.totalPayable) : '—'}</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Paid</span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-[#047857] block mt-2 break-all">{summary ? formatMoney(summary.totalPaid) : '—'}</span>
          <span className="text-[11px] text-[#047857]">{summary ? `${summary.paidCount} paid` : ''}</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Pending</span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-[#B45309] block mt-2 break-all">{summary ? formatMoney(summary.totalPending) : '—'}</span>
          <span className="text-[11px] text-[#B45309]">{summary ? `${summary.headcount - summary.paidCount} pending` : ''}</span>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Headcount</span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-[#111827] block mt-2">{summary ? summary.headcount : '—'}</span>
          <span className="text-[11px] text-[#7185A5]">rows this month</span>
        </Card>
      </div>

      {/* Rows */}
      <Card padding="none" className="overflow-hidden">
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading salaries…</div>
        ) : list.data.salaries.length === 0 ? (
          <EmptyState
            icon={<Banknote className="w-6 h-6" />}
            title={`No salary run for ${formatMonthYear(currentMonth)}`}
            description={
              canGenerate
                ? 'Generate the run to create a pending row for every active employee with a monthly salary.'
                : 'Runs can be generated at most one month ahead.'
            }
            actionLabel={canGenerate ? `Generate ${formatMonthYear(currentMonth)} run` : undefined}
            onAction={canGenerate ? handleGenerate : undefined}
          />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">No rows match the filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="salary-table">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3 text-right">Base</th>
                  <th className="py-3 px-3 text-right">Adjustments</th>
                  <th className="py-3 px-3 text-right">Net payable</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap" title="Approved unpaid leave in this month (weekdays). Informational: nothing is deducted automatically.">
                    Unpaid leave
                  </th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Paid on</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {rows.map(row => (
                  <SalaryTableRow key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openId && (
        <SalaryDetailModal
          salaryId={openId}
          today={list.data?.today ?? ''}
          onClose={() => setOpenId(null)}
          onChanged={() => list.reload()}
        />
      )}
    </div>
  );
};

const SalaryTableRow: React.FC<{ row: SalaryRow; onOpen: () => void }> = ({ row, onOpen }) => {
  const adjustmentClass = row.adjustments.startsWith('-') ? 'text-[#E11D48]' : row.adjustments === '0.00' ? 'text-[#7185A5]' : 'text-[#047857]';
  return (
    <tr className="hover:bg-[#F7F9FC]/60 transition-colors" data-testid={`salary-row-${row.employeeCode}`}>
      <td className="py-3 px-3">
        <div className="font-semibold text-[#111827] whitespace-nowrap">{row.employeeName}</div>
        <div className="text-[10px] text-[#7185A5] whitespace-nowrap">
          <span className="font-mono">{row.employeeCode}</span> · {row.department}
        </div>
      </td>
      <td className="py-3 px-3 text-right font-mono text-[#7185A5] whitespace-nowrap">{formatMoney(row.baseSalary)}</td>
      <td className={`py-3 px-3 text-right font-mono whitespace-nowrap ${adjustmentClass}`}>
        {row.adjustments.startsWith('-') || row.adjustments === '0.00' ? formatMoney(row.adjustments) : `+${formatMoney(row.adjustments)}`}
        {row.lineCount ? <span className="block text-[10px] text-[#7185A5]">{row.lineCount} line{row.lineCount === 1 ? '' : 's'}</span> : null}
      </td>
      <td className="py-3 px-3 text-right font-mono font-bold text-[#111827] whitespace-nowrap">{formatMoney(row.netPayable)}</td>
      <td className="py-3 px-3 text-center whitespace-nowrap">
        {row.unpaidLeaveDays > 0 ? (
          <span className="text-[11px] font-semibold text-[#B45309]" title="Approved unpaid leave this month (weekdays)">
            {row.unpaidLeaveDays} day{row.unpaidLeaveDays === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-[#7185A5]">—</span>
        )}
      </td>
      <td className="py-3 px-3 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1">
          <SalaryStatusBadge status={row.status} />
          {row.slipPublished && (
            <span title="Payslip published" className="text-[#5038F5]">
              <FileCheck2 className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-3 text-[#7185A5] whitespace-nowrap">{row.paidOn ? formatDate(row.paidOn) : '—'}</td>
      <td className="py-3 px-3 text-right whitespace-nowrap">
        <Button variant="outline" size="sm" icon={<SlidersHorizontal className="w-3 h-3" />} onClick={onOpen} aria-label={`Manage salary of ${row.employeeName}`}>
          {row.status === 'pending' ? 'Manage' : 'View'}
        </Button>
      </td>
    </tr>
  );
};
