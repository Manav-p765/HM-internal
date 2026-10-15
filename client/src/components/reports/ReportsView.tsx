import React, { useState } from 'react';
import { Link } from 'react-router';
import { useApp } from '../../context/AppContext';
import { reportsApi } from '../../api/reports';
import { useApiData } from '../../api/useApiData';
import { AGING_LABEL, CategoryTotal, PeriodParams, ReportPeriod } from '../../types/ledger';
import { INVOICE_STATUS_LABEL } from '../../types/invoices';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { LoadError } from '../common/LoadError';
import { PeriodPicker } from '../common/PeriodPicker';
import { InvoiceStatusBadge } from '../invoices/InvoiceStatusBadge';
import { TrendBars } from './TrendBars';
import { BarChart3, Banknote, Download, FileText, Printer, Scale } from 'lucide-react';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

type Tab = 'pnl' | 'trend' | 'invoices' | 'salary';

const TABS: { id: Tab; label: string; icon: React.ReactNode; adminOnly: boolean }[] = [
  { id: 'pnl', label: 'Profit & Loss', icon: <Scale className="w-4 h-4 hidden sm:block" />, adminOnly: true },
  { id: 'trend', label: 'Trend', icon: <BarChart3 className="w-4 h-4 hidden sm:block" />, adminOnly: true },
  { id: 'invoices', label: 'Invoices', icon: <FileText className="w-4 h-4 hidden sm:block" />, adminOnly: false },
  { id: 'salary', label: 'Salary', icon: <Banknote className="w-4 h-4 hidden sm:block" />, adminOnly: true },
];

const periodText = (p: ReportPeriod) => `${formatDate(p.from)} – ${formatDate(p.to)}`;

const th = 'py-2.5 px-2 sm:px-3 font-semibold';
const td = 'py-2.5 px-2 sm:px-3';

// /reports (admin: every tab; manager: Invoices only). Every figure comes from /api/reports, computed in SQL
// on the server; nothing is added up here. Each tab exports the same data as CSV and prints without the app
// chrome (.no-print).
export const ReportsView: React.FC = () => {
  const { currentUser } = useApp();
  const isAdmin = currentUser.role === 'admin';
  const tabs = TABS.filter(t => isAdmin || !t.adminOnly);
  const [tab, setTab] = useState<Tab>(isAdmin ? 'pnl' : 'invoices');
  const [period, setPeriod] = useState<PeriodParams>({ preset: 'this_fy' });
  const [months, setMonths] = useState(12);

  const csvReport = tab === 'pnl' ? 'profit-loss' : tab === 'invoices' ? 'invoices' : tab === 'salary' ? 'salary' : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Reports</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            {isAdmin ? 'Profit & loss, trend, invoices and salaries from the server ledger' : 'Invoice status, aging and top clients'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          {csvReport && (
            <a
              href={reportsApi.csvUrl(csvReport, period)}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[#DFE6F1] bg-white text-[#111827] hover:bg-[#F8FAFC]"
              data-testid="report-csv"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </a>
          )}
          <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div className="flex gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg overflow-x-auto" role="tablist" aria-label="Report">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                tab === t.id ? 'bg-[#5038F5] text-white' : 'text-[#7185A5] hover:text-[#111827]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'trend' ? (
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] self-start"
            aria-label="Months"
          >
            {[6, 12, 24].map(n => (
              <option key={n} value={n}>
                Last {n} months
              </option>
            ))}
          </select>
        ) : (
          <PeriodPicker value={period} onChange={setPeriod} />
        )}
      </div>

      {tab === 'pnl' && isAdmin && <ProfitLossTab period={period} />}
      {tab === 'trend' && isAdmin && <TrendTab months={months} />}
      {tab === 'invoices' && <InvoicesTab period={period} />}
      {tab === 'salary' && isAdmin && <SalaryTab period={period} />}
    </div>
  );
};

const PrintHeading: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <div className="hidden print:block mb-4">
    <h2 className="text-lg font-bold">{title}</h2>
    <p className="text-xs">{sub}</p>
  </div>
);

const Loading: React.FC<{ error: string | null; reload: () => void }> = ({ error, reload }) =>
  error ? <LoadError message={error} onRetry={reload} /> : <div className="py-10 text-center text-xs text-[#7185A5]">Loading report…</div>;

const Kpi: React.FC<{ label: string; value: string; tone?: string; sub?: string; testId?: string }> = ({ label, value, tone = 'text-[#111827]', sub, testId }) => (
  <Card padding="md">
    <span className="text-xs font-semibold text-[#7185A5] block">{label}</span>
    <span className={`text-sm sm:text-2xl font-mono font-bold block mt-2 whitespace-nowrap ${tone}`} data-testid={testId}>
      {value}
    </span>
    {sub && <span className="text-[11px] text-[#7185A5]">{sub}</span>}
  </Card>
);

// ---------------------------------------------------------------------------
const CategoryTable: React.FC<{ title: string; rows: CategoryTotal[]; total: string; tone: string; testId: string }> = ({ title, rows, total, tone, testId }) => (
  <Card padding="none" className="overflow-hidden">
    <table className="w-full text-left text-xs" data-testid={testId}>
      <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">{title}</caption>
      <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
        <tr>
          <th className={th}>Category</th>
          <th className={`${th} text-right`}>Entries</th>
          <th className={`${th} text-right`}>Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#DFE6F1]">
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className={`${td} text-center text-[#7185A5]`}>
              Nothing in this period.
            </td>
          </tr>
        )}
        {rows.map(r => (
          <tr key={r.category}>
            <td className={`${td} text-[#111827]`}>{r.category}</td>
            <td className={`${td} text-right text-[#7185A5]`}>{r.count}</td>
            <td className={`${td} text-right font-mono whitespace-nowrap ${tone}`}>{formatMoney(r.total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 border-[#DFE6F1]">
        <tr>
          <td className={`${td} font-bold text-[#111827]`} colSpan={2}>
            Total
          </td>
          <td className={`${td} text-right font-mono font-bold whitespace-nowrap ${tone}`}>{formatMoney(total)}</td>
        </tr>
      </tfoot>
    </table>
  </Card>
);

const ProfitLossTab: React.FC<{ period: PeriodParams }> = ({ period }) => {
  const report = useApiData(() => reportsApi.profitLoss(period), [JSON.stringify(period)]);
  const r = report.data;
  if (!r) return <Loading error={report.error} reload={report.reload} />;
  return (
    <div className="space-y-4" data-testid="pnl-report">
      <PrintHeading title="Profit & Loss (cash basis)" sub={periodText(r.period)} />
      <p className="text-xs text-[#7185A5] no-print">
        <span className="inline-block px-2 py-0.5 mr-2 rounded bg-[#5038F5]/10 text-[#5038F5] font-semibold" data-testid="cash-basis">
          Cash basis
        </span>
        Money received and paid between {periodText(r.period)}, by transaction date. Voided and reversed entries are excluded.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Kpi label="Income" value={formatMoney(r.totals.income)} tone="text-[#047857]" testId="pnl-income" />
        <Kpi label="Expenses" value={formatMoney(r.totals.expense)} tone="text-[#B45309]" testId="pnl-expense" />
        <Kpi label="Net" value={formatMoney(r.totals.net)} tone={r.totals.net.startsWith('-') ? 'text-[#E11D48]' : 'text-[#111827]'} testId="pnl-net" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryTable title="Income by category" rows={r.income} total={r.totals.income} tone="text-[#047857]" testId="pnl-income-table" />
        <CategoryTable title="Expenses by category" rows={r.expense} total={r.totals.expense} tone="text-[#111827]" testId="pnl-expense-table" />
      </div>
    </div>
  );
};

const TrendTab: React.FC<{ months: number }> = ({ months }) => {
  const report = useApiData(() => reportsApi.trend(months), [months]);
  if (!report.data) return <Loading error={report.error} reload={report.reload} />;
  return (
    <Card padding="sm" className="sm:p-5">
      <PrintHeading title={`Income vs expenses, last ${months} months`} sub={`As of ${formatDate(report.data.today)}`} />
      <h3 className="text-sm font-bold text-[#111827] mb-1 no-print">Income vs expenses by month</h3>
      <p className="text-xs text-[#7185A5] mb-4 no-print">Cash basis; voided and reversed entries excluded.</p>
      <TrendBars months={report.data.months} testId="report-trend" />
    </Card>
  );
};

const InvoicesTab: React.FC<{ period: PeriodParams }> = ({ period }) => {
  const report = useApiData(() => reportsApi.invoices(period), [JSON.stringify(period)]);
  const r = report.data;
  if (!r) return <Loading error={report.error} reload={report.reload} />;
  return (
    <div className="space-y-4" data-testid="invoice-report">
      <PrintHeading title="Invoices" sub={`${periodText(r.period)} · aging as of ${formatDate(r.today)}`} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Kpi label="Invoiced (sent and paid)" value={formatMoney(r.summary.invoiced)} sub={`${r.summary.count} invoices dated in the period`} testId="inv-invoiced" />
        <Kpi label="Collected on them" value={formatMoney(r.summary.collected)} tone="text-[#047857]" testId="inv-collected" />
        <Kpi label="Still outstanding" value={formatMoney(r.summary.outstanding)} tone="text-[#B45309]" testId="inv-outstanding" />
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] sm:text-xs" data-testid="status-table">
            <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">By status ({periodText(r.period)})</caption>
            <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
              <tr>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>
                  <span className="sm:hidden" aria-hidden>#</span>
                  <span className="sr-only sm:not-sr-only">Invoices</span>
                </th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {r.byStatus.map(s => (
                <tr key={s.status}>
                  <td className={td}>
                    <InvoiceStatusBadge status={s.status} size="sm" />
                    <span className="sr-only">{INVOICE_STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className={`${td} text-right`}>{s.count}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(s.total)}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(s.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="aging-table">
            <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">
              Outstanding by age (as of {formatDate(r.today)}, every open invoice)
            </caption>
            <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
              <tr>
                <th className={th}>Age</th>
                <th className={`${th} text-right`}>Invoices</th>
                <th className={`${th} text-right`}>Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {r.aging.map(a => (
                <tr key={a.bucket} data-testid={`aging-${a.bucket}`}>
                  <td className={`${td} text-[#111827]`}>{AGING_LABEL[a.bucket]}</td>
                  <td className={`${td} text-right`}>{a.count}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap ${a.bucket === 'not_due' ? '' : a.count ? 'text-[#E11D48]' : ''}`}>{formatMoney(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.openInvoices.length > 0 && (
          <div className="overflow-x-auto border-t border-[#DFE6F1]">
            <table className="w-full text-left text-[11px] sm:text-xs" data-testid="open-invoices">
              <caption className="sr-only">Open invoices</caption>
              <thead className="text-[#7185A5]">
                <tr>
                  <th className={th}>Invoice</th>
                  <th className={th}>Client</th>
                  <th className={`${th} hidden sm:table-cell`}>Due</th>
                  <th className={`${th} text-right`}>Overdue</th>
                  <th className={`${th} text-right`}>Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {r.openInvoices.map(i => (
                  <tr key={i.id}>
                    <td className={`${td} font-mono whitespace-nowrap`}>
                      <Link to={`/invoices/${i.id}`} className="text-[#5038F5] hover:underline">
                        {i.invoiceNumber}
                      </Link>
                    </td>
                    <td className={td}>{i.clientName}</td>
                    <td className={`${td} whitespace-nowrap hidden sm:table-cell`}>{formatDate(i.dueDate)}</td>
                    <td className={`${td} text-right`}>{i.daysOverdue || '—'}</td>
                    <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(i.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.openInvoicesTruncated && <p className="px-3 py-2 text-[11px] text-[#7185A5]">Showing the first 200 open invoices; the totals above cover all of them.</p>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(
          [
            ['Top clients by invoiced (period)', r.topClients.byInvoiced],
            ['Top clients by outstanding (today)', r.topClients.byOutstanding],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title} padding="none" className="overflow-hidden">
            <table className="w-full text-left text-xs">
              <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">{title}</caption>
              <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
                <tr>
                  <th className={th}>Client</th>
                  <th className={`${th} text-right`}>Invoices</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className={`${td} text-center text-[#7185A5]`}>
                      None.
                    </td>
                  </tr>
                )}
                {rows.map(c => (
                  <tr key={c.clientName}>
                    <td className={`${td} text-[#111827]`}>{c.clientName}</td>
                    <td className={`${td} text-right`}>{c.count}</td>
                    <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  );
};

const SalaryTab: React.FC<{ period: PeriodParams }> = ({ period }) => {
  const report = useApiData(() => reportsApi.salary(period), [JSON.stringify(period)]);
  const r = report.data;
  if (!r) return <Loading error={report.error} reload={report.reload} />;
  return (
    <div className="space-y-4" data-testid="salary-report">
      <PrintHeading title="Salaries paid" sub={periodText(r.period)} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Paid in the period" value={formatMoney(r.totals.paid)} tone="text-[#047857]" sub={`${r.totals.count} salary payments`} testId="salary-paid" />
        <Kpi label="People paid" value={String(r.totals.headcount)} />
        <Kpi label="Pending (months in the period)" value={formatMoney(r.pending.total)} tone="text-[#B45309]" sub={`${r.pending.count} unpaid rows`} />
        <Kpi label="Basis" value="Paid date" sub="Un-paid (reversed) salaries are excluded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-left text-xs" data-testid="salary-by-month">
            <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">By salary month</caption>
            <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
              <tr>
                <th className={th}>Month</th>
                <th className={`${th} text-right`}>Payments</th>
                <th className={`${th} text-right`}>Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {r.byMonth.length === 0 && (
                <tr>
                  <td colSpan={3} className={`${td} text-center text-[#7185A5]`}>
                    No salaries paid in this period.
                  </td>
                </tr>
              )}
              {r.byMonth.map(m => (
                <tr key={m.month}>
                  <td className={`${td} text-[#111827]`}>
                    <Link to={`/salary?month=${m.month}`} className="hover:underline">
                      {formatMonthYear(m.month)}
                    </Link>
                  </td>
                  <td className={`${td} text-right`}>{m.count}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-left text-xs" data-testid="salary-by-department">
            <caption className="text-left px-3 pt-3 pb-2 text-sm font-bold text-[#111827]">By department</caption>
            <thead className="bg-[#F7F9FC] border-y border-[#DFE6F1] text-[#7185A5]">
              <tr>
                <th className={th}>Department</th>
                <th className={`${th} text-right`}>People</th>
                <th className={`${th} text-right`}>Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {r.byDepartment.length === 0 && (
                <tr>
                  <td colSpan={3} className={`${td} text-center text-[#7185A5]`}>
                    No salaries paid in this period.
                  </td>
                </tr>
              )}
              {r.byDepartment.map(d => (
                <tr key={d.department}>
                  <td className={`${td} text-[#111827]`}>{d.department}</td>
                  <td className={`${td} text-right`}>{d.headcount}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap`}>{formatMoney(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};
