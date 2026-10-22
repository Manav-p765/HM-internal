import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { employeesApi } from '../../api/employees';
import { invoicesApi } from '../../api/invoices';
import { salaryApi } from '../../api/salary';
import { reportsApi } from '../../api/reports';
import { transactionsApi } from '../../api/transactions';
import { useApiData } from '../../api/useApiData';
import { PeriodPreset } from '../../types/ledger';
import { invoiceLabel } from '../../types/invoices';
import { Card } from '../common/Card';
import { TrendBars } from '../reports/TrendBars';
import { InvoiceStatusBadge } from '../invoices/InvoiceStatusBadge';
import { OtherCurrencyTotals } from '../invoices/OtherCurrencyTotals';
import { ArrowRight, Banknote, Receipt, Scale, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

// Admin only: the "Overview" tab of the dashboard (income, expenses, invoices, salaries, ledger). Every
// amount is a server string shown with formatMoney(); nothing is computed in the browser. Rendered only for
// admins, so managers' browsers never call these APIs (the server refuses them anyway).

const FINANCE_PERIODS: { id: PeriodPreset; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_fy', label: 'This FY' },
];

const MoneyCard: React.FC<{ label: string; icon: React.ReactNode; tone: string; children: React.ReactNode }> = ({ label, icon, tone, children }) => (
  <Card padding="md" className="relative overflow-hidden">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-[#7185A5]">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>{icon}</div>
    </div>
    <div className="mt-2">{children}</div>
  </Card>
);

export const FinanceOverview: React.FC = () => {
  const navigate = useNavigate();
  const [financePeriod, setFinancePeriod] = useState<PeriodPreset>('this_month');
  const periodLabel = FINANCE_PERIODS.find(p => p.id === financePeriod)?.label ?? '';

  const roster = useApiData(() => employeesApi.list({ limit: 1 }), []);
  const invoiceData = useApiData(() => invoicesApi.list({ limit: 5 }), []);
  const pl = useApiData(() => reportsApi.profitLoss({ preset: financePeriod }), [financePeriod]);
  const trend = useApiData(() => reportsApi.trend(6), []);
  const recentLedger = useApiData(() => transactionsApi.list({ limit: 5 }), []);
  const salaryMonth = useApiData(() => salaryApi.list(), []);

  const plTotals = pl.data?.totals;
  const invoiceSummary = invoiceData.data?.summary;
  const recentInvoices = invoiceData.data?.invoices ?? [];
  const salarySummary = salaryMonth.data?.summary;
  const money = (v: string | undefined) => (v === undefined ? '—' : formatMoney(v));

  return (
    <div className="space-y-6" data-testid="finance-overview">
      <div className="flex items-center gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg shadow-xs self-start w-fit">
        {FINANCE_PERIODS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFinancePeriod(tab.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              financePeriod === tab.id ? 'bg-[#5038F5] text-white shadow-xs' : 'text-[#7185A5] hover:text-[#111827]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MoneyCard label="Total Income" icon={<TrendingUp className="w-4 h-4" />} tone="bg-[#047857]/10 text-[#047857]">
          <span className="text-2xl font-mono font-bold text-[#111827]" data-testid="kpi-income">
            {money(plTotals?.income)}
          </span>
          <p className="text-[11px] text-[#7185A5] mt-1">Cash received · {periodLabel}</p>
        </MoneyCard>

        <MoneyCard label="Total Expenses" icon={<TrendingDown className="w-4 h-4" />} tone="bg-[#E11D48]/10 text-[#E11D48]">
          <span className="text-2xl font-mono font-bold text-[#111827]" data-testid="kpi-expense">
            {money(plTotals?.expense)}
          </span>
          <p className="text-[11px] text-[#7185A5] mt-1">Salaries and operating costs · {periodLabel}</p>
        </MoneyCard>

        <MoneyCard label="Net Balance" icon={<Scale className="w-4 h-4" />} tone="bg-[#5038F5]/10 text-[#5038F5]">
          <span
            className={`text-2xl font-mono font-bold ${plTotals?.net.startsWith('-') ? 'text-[#E11D48]' : 'text-[#047857]'}`}
            data-testid="kpi-net"
          >
            {money(plTotals?.net)}
          </span>
          <p className="text-[11px] text-[#7185A5] mt-1">Cash basis · {periodLabel}</p>
        </MoneyCard>

        <MoneyCard label="Outstanding Invoices" icon={<Receipt className="w-4 h-4" />} tone="bg-[#B45309]/10 text-[#B45309]">
          <span className="text-2xl font-mono font-bold text-[#B45309]">{money(invoiceSummary?.outstandingTotal)}</span>
          <OtherCurrencyTotals rows={invoiceSummary?.otherCurrencies} field="outstandingTotal" />
          <p className="text-[11px] text-[#7185A5] mt-1" data-testid="kpi-invoice-detail">
            Overdue <span className="font-mono text-[#E11D48]">{money(invoiceSummary?.overdueTotal)}</span> · Collected this month{' '}
            <span className="font-mono text-[#047857]">{money(invoiceSummary?.collectedThisMonth)}</span>
          </p>
        </MoneyCard>

        <MoneyCard label="Monthly Payroll" icon={<Users className="w-4 h-4" />} tone="bg-[#5038F5]/10 text-[#5038F5]">
          <span className="text-2xl font-mono font-bold text-[#111827]">{money(roster.data?.summary.monthlyPayroll)}</span>
          <p className="text-[11px] text-[#7185A5] mt-1">{roster.data ? `${roster.data.summary.active} active employees` : 'Active employees'}</p>
        </MoneyCard>

        <MoneyCard label="Pending Salary Payments" icon={<Banknote className="w-4 h-4" />} tone="bg-[#5038F5]/10 text-[#5038F5]">
          <span className="text-2xl font-mono font-bold text-[#111827]">{money(salarySummary?.totalPending)}</span>
          <p className="text-[11px] text-[#7185A5] mt-1">
            {salarySummary && salaryMonth.data
              ? `${salarySummary.headcount - salarySummary.paidCount} unpaid in ${formatMonthYear(salaryMonth.data.month)}`
              : 'Unpaid salaries this month'}
          </p>
        </MoneyCard>
      </div>

      <Card padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Monthly Income vs Expenses</h3>
            <p className="text-xs text-[#7185A5]">Last 6 months from the ledger (voided and reversed entries excluded)</p>
          </div>
          <button onClick={() => navigate('/reports')} className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer self-start">
            Reports &rarr;
          </button>
        </div>
        {trend.error ? (
          <p className="py-6 text-center text-xs text-[#7185A5]">The trend could not be loaded.</p>
        ) : !trend.data ? (
          <p className="py-6 text-center text-xs text-[#7185A5]">Loading…</p>
        ) : (
          <TrendBars months={trend.data.months} testId="dashboard-trend" />
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Recent Transactions</h3>
              <p className="text-xs text-[#7185A5]">Latest income and expense entries</p>
            </div>
            <button
              onClick={() => navigate('/accounting')}
              className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-[#DFE6F1] mt-1">
            {!recentLedger.data ? (
              <p className="py-6 text-center text-xs text-[#7185A5]">{recentLedger.error ? 'Transactions could not be loaded.' : 'Loading…'}</p>
            ) : recentLedger.data.transactions.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#7185A5]">No transactions yet.</p>
            ) : (
              recentLedger.data.transactions.map(txn => (
                <div key={txn.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111827] truncate">{txn.description}</div>
                    <div className="text-[11px] text-[#7185A5] mt-0.5 flex items-center gap-1.5">
                      <span>{formatDate(txn.txnDate)}</span>
                      <span>·</span>
                      <span className="truncate">{txn.category}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-mono font-bold ${txn.type === 'income' ? 'text-[#047857]' : 'text-[#111827]'}`}>
                      {txn.type === 'income' ? '+' : '−'}
                      {formatMoney(txn.amount)}
                    </span>
                    <div className="text-[10px] text-[#7185A5] mt-0.5">{txn.paymentMethod}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Recent Invoices</h3>
              <p className="text-xs text-[#7185A5]">Client billing and payment status</p>
            </div>
            <button
              onClick={() => navigate('/invoices')}
              className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              View Invoices <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-[#DFE6F1] mt-1">
            {invoiceData.error ? (
              <p className="py-6 text-center text-xs text-[#7185A5]">Invoices could not be loaded.</p>
            ) : !invoiceData.data ? (
              <p className="py-6 text-center text-xs text-[#7185A5]">Loading invoices…</p>
            ) : recentInvoices.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#7185A5]">No invoices yet.</p>
            ) : (
              recentInvoices.map(inv => (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-[#F7F9FC]/60 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#111827]">{invoiceLabel(inv)}</span>
                      <InvoiceStatusBadge status={inv.derivedStatus} size="sm" />
                    </div>
                    <div className="text-[11px] text-[#7185A5] mt-0.5 truncate">
                      {inv.clientName} · Due {formatDate(inv.dueDate)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-[#111827]">{formatMoney(inv.total, inv.currency)}</span>
                    {inv.status === 'sent' && <div className="text-[10px] font-mono text-[#E11D48] mt-0.5">Due: {formatMoney(inv.balance, inv.currency)}</div>}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
