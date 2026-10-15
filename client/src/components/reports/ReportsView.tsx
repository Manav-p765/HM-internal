import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  Banknote,
  Download,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { formatCurrency, formatDate, exportToCSV } from '../../utils/formatters';
import { invoicesApi } from '../../api/invoices';
import { useApiData } from '../../api/useApiData';
import { InvoiceStatusBadge } from '../invoices/InvoiceStatusBadge';
import { INVOICE_STATUS_LABEL } from '../../types/invoices';
import { CURRENCY, formatMoney, sumMoney } from '../../utils/money';

type ReportType = 'income' | 'expense' | 'pnl' | 'invoices' | 'salary';

export const ReportsView: React.FC = () => {
  const { transactions, salaries } = useApp();

  const [activeReport, setActiveReport] = useState<ReportType>('pnl');

  // Date filters
  const now = new Date();
  const firstDayOfYear = `${now.getFullYear()}-01-01`;
  const todayStr = now.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfYear);
  const [endDate, setEndDate] = useState(todayStr);

  // 1. Transactions in range
  const rangeTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const incomeTxns = useMemo(() => {
    return rangeTransactions.filter(t => t.type === 'income');
  }, [rangeTransactions]);

  const expenseTxns = useMemo(() => {
    return rangeTransactions.filter(t => t.type === 'expense');
  }, [rangeTransactions]);

  const totalIncome = useMemo(() => {
    return incomeTxns.reduce((sum, t) => sum + t.amount, 0);
  }, [incomeTxns]);

  const totalExpense = useMemo(() => {
    return expenseTxns.reduce((sum, t) => sum + t.amount, 0);
  }, [expenseTxns]);

  const netProfitLoss = totalIncome - totalExpense;

  // 2. Invoices in range: from the API (only while this report is open). Phase 10 rewrites reports;
  // until then the list is capped at the API maximum of 200 and cancelled invoices are excluded.
  const invoiceReport = useApiData(
    () =>
      activeReport === 'invoices'
        ? invoicesApi.list({ from: startDate || undefined, to: endDate || undefined, limit: 200 })
        : Promise.resolve(null),
    [activeReport, startDate, endDate],
  );
  const rangeInvoices = useMemo(
    () => (invoiceReport.data?.invoices ?? []).filter(i => i.status !== 'cancelled'),
    [invoiceReport.data],
  );
  const invoiceReportTruncated = (invoiceReport.data?.total ?? 0) > (invoiceReport.data?.invoices.length ?? 0);
  const totalInvoicedValue = sumMoney(rangeInvoices.map(i => i.total));
  const totalInvoicePaidValue = sumMoney(rangeInvoices.map(i => i.amountPaid));
  const totalInvoiceOutstandingValue = sumMoney(rangeInvoices.map(i => i.balance));

  // 3. Salaries in range
  const rangeSalaries = useMemo(() => {
    return salaries.filter(s => {
      const salDate = s.paymentDate || `${s.salaryMonth}-01`;
      if (startDate && salDate < startDate) return false;
      if (endDate && salDate > endDate) return false;
      return true;
    });
  }, [salaries, startDate, endDate]);

  const totalSalaryCommitted = useMemo(() => {
    return rangeSalaries.reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [rangeSalaries]);

  const totalSalaryPaid = useMemo(() => {
    return rangeSalaries
      .filter(s => s.status === 'Paid')
      .reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [rangeSalaries]);

  const totalSalaryPending = useMemo(() => {
    return rangeSalaries
      .filter(s => s.status === 'Pending')
      .reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [rangeSalaries]);

  // Category breakdown for expenses
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenseTxns.forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenseTxns]);

  // Category breakdown for income
  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    incomeTxns.forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [incomeTxns]);

  // CSV Export
  const handleExportCSV = () => {
    if (activeReport === 'income') {
      const headers = ['Date', 'Category', 'Description', 'Method', 'Reference', `Amount (${CURRENCY})`];
      const rows = incomeTxns.map(t => [t.date, t.category, t.description, t.paymentMethod, t.referenceNumber || '', t.amount]);
      exportToCSV(`income_report_${startDate}_to_${endDate}`, headers, rows);
    } else if (activeReport === 'expense') {
      const headers = ['Date', 'Category', 'Description', 'Method', 'Reference', `Amount (${CURRENCY})`];
      const rows = expenseTxns.map(t => [t.date, t.category, t.description, t.paymentMethod, t.referenceNumber || '', t.amount]);
      exportToCSV(`expense_report_${startDate}_to_${endDate}`, headers, rows);
    } else if (activeReport === 'pnl') {
      const headers = ['Metric', `Amount (${CURRENCY})`, 'Notes'];
      const rows = [
        ['Total Recognized Income', totalIncome, 'Recorded cash inflows in period'],
        ['Total Recognized Expenses', totalExpense, 'Recorded operational expenses and disbursed salaries'],
        ['Net Operating Profit / (Loss)', netProfitLoss, 'Recognized Income minus Recognized Expenses'],
      ];
      exportToCSV(`pnl_summary_${startDate}_to_${endDate}`, headers, rows);
    } else if (activeReport === 'invoices') {
      const headers = ['Invoice #', 'Client', 'Date', 'Due Date', `Billed Total (${CURRENCY})`, `Paid (${CURRENCY})`, `Outstanding (${CURRENCY})`, 'Status'];
      const rows = rangeInvoices.map(i => [i.invoiceNumber, i.clientName, i.invoiceDate, i.dueDate, i.total, i.amountPaid, i.balance, INVOICE_STATUS_LABEL[i.derivedStatus]]);
      exportToCSV(`invoice_payment_report_${startDate}_to_${endDate}`, headers, rows);
    } else if (activeReport === 'salary') {
      const headers = ['Employee', 'Department', 'Month', `Base (${CURRENCY})`, `Adjustments (${CURRENCY})`, `Final Payable (${CURRENCY})`, 'Status', 'Payment Date'];
      const rows = rangeSalaries.map(s => [s.employeeName, s.department, s.salaryMonth, s.baseSalary, s.adjustments, s.finalPayableAmount, s.status, s.paymentDate || '']);
      exportToCSV(`salary_report_${startDate}_to_${endDate}`, headers, rows);
    }
  };

  const reportsList = [
    { id: 'pnl', label: 'Profit & Loss Summary', icon: <Scale className="w-4 h-4" /> },
    { id: 'income', label: 'Income Report', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'expense', label: 'Expense Report', icon: <TrendingDown className="w-4 h-4" /> },
    { id: 'invoices', label: 'Invoice Payment Report', icon: <Receipt className="w-4 h-4" /> },
    { id: 'salary', label: 'Monthly Salary Report', icon: <Banknote className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner per master prompt */}
      <div className="p-3 bg-[#F1F5F9] border border-[#DFE6F1] rounded-xl flex items-center justify-between text-xs text-[#475569]">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#5038F5] shrink-0" />
          <span>
            <strong>Basic Internal Management Reports:</strong> Generated from internal company ledger and payroll records for management tracking, not formal audited financial statements.
          </span>
        </div>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Financial & Operational Reports
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Audit trailing revenue, overhead breakdowns, client receivables, and salary distributions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-[#DFE6F1]">
            <Calendar className="w-3.5 h-3.5 text-[#7185A5]" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-none"
            />
            <span className="text-xs text-[#7185A5]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[#DFE6F1]">
        {reportsList.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeReport === tab.id
                ? 'bg-[#5038F5] text-white shadow-xs'
                : 'text-[#475569] hover:text-[#111827] hover:bg-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* REPORT 1: PROFIT & LOSS SUMMARY */}
      {activeReport === 'pnl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Recognized Income</span>
              <span className="text-2xl font-mono font-bold text-[#047857] block mt-2">
                {formatCurrency(totalIncome, CURRENCY)}
              </span>
              <p className="text-[11px] text-[#7185A5] mt-1">{incomeTxns.length} income transactions</p>
            </Card>

            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Recognized Expenses</span>
              <span className="text-2xl font-mono font-bold text-[#E11D48] block mt-2">
                {formatCurrency(totalExpense, CURRENCY)}
              </span>
              <p className="text-[11px] text-[#7185A5] mt-1">{expenseTxns.length} expense transactions</p>
            </Card>

            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Net Operating Profit</span>
              <span
                className={`text-2xl font-mono font-bold block mt-2 ${
                  netProfitLoss >= 0 ? 'text-[#047857]' : 'text-[#E11D48]'
                }`}
              >
                {formatCurrency(netProfitLoss, CURRENCY)}
              </span>
              <p className="text-[11px] text-[#7185A5] mt-1">
                Margin: {totalIncome > 0 ? `${Math.round((netProfitLoss / totalIncome) * 100)}%` : '0%'}
              </p>
            </Card>
          </div>

          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-4">
              P&L Operational Breakdown
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[#DFE6F1] text-xs font-semibold text-[#111827]">
                <span>1. Total Recognized Revenue</span>
                <span className="font-mono text-[#047857]">
                  +{formatCurrency(totalIncome, CURRENCY)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#DFE6F1] text-xs font-semibold text-[#111827]">
                <span>2. Total Recognized Expenses</span>
                <span className="font-mono text-[#E11D48]">
                  -{formatCurrency(totalExpense, CURRENCY)}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 bg-[#F7F9FC] px-3 rounded-lg text-sm font-bold text-[#111827]">
                <span>Net Surplus / (Deficit)</span>
                <span className={`font-mono ${netProfitLoss >= 0 ? 'text-[#047857]' : 'text-[#E11D48]'}`}>
                  {formatCurrency(netProfitLoss, CURRENCY)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* REPORT 2: INCOME REPORT */}
      {activeReport === 'income' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Total Inflow</span>
              <span className="text-2xl font-mono font-bold text-[#047857] block mt-1">
                {formatCurrency(totalIncome, CURRENCY)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Top Inflow Category</span>
              <span className="text-lg font-bold text-[#111827] block mt-1">
                {incomeByCategory[0] ? incomeByCategory[0][0] : 'None'}
              </span>
              <span className="text-xs font-mono text-[#7185A5]">
                {incomeByCategory[0] ? formatCurrency(incomeByCategory[0][1], CURRENCY) : '—'}
              </span>
            </Card>
          </div>

          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-3">Revenue By Category</h3>
            <div className="space-y-2">
              {incomeByCategory.map(([cat, amount]) => {
                const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#111827]">{cat}</span>
                      <span className="font-mono font-bold text-[#047857]">
                        {formatCurrency(amount, CURRENCY)} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div className="h-full bg-[#047857] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* REPORT 3: EXPENSE REPORT */}
      {activeReport === 'expense' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Total Overhead Expenses</span>
              <span className="text-2xl font-mono font-bold text-[#E11D48] block mt-1">
                {formatCurrency(totalExpense, CURRENCY)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Top Expense Category</span>
              <span className="text-lg font-bold text-[#111827] block mt-1">
                {expenseByCategory[0] ? expenseByCategory[0][0] : 'None'}
              </span>
              <span className="text-xs font-mono text-[#7185A5]">
                {expenseByCategory[0] ? formatCurrency(expenseByCategory[0][1], CURRENCY) : '—'}
              </span>
            </Card>
          </div>

          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-3">Expenses By Category</h3>
            <div className="space-y-2.5">
              {expenseByCategory.map(([cat, amount]) => {
                const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#111827]">{cat}</span>
                      <span className="font-mono font-bold text-[#E11D48]">
                        {formatCurrency(amount, CURRENCY)} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div className="h-full bg-[#E11D48] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* REPORT 4: INVOICE PAYMENT REPORT */}
      {activeReport === 'invoices' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Total Invoiced</span>
              <span className="text-2xl font-mono font-bold text-[#111827] block mt-1">
                {formatMoney(totalInvoicedValue)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Actual Payments Received</span>
              <span className="text-2xl font-mono font-bold text-[#047857] block mt-1">
                {formatMoney(totalInvoicePaidValue)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Remaining Outstanding</span>
              <span className="text-2xl font-mono font-bold text-[#B45309] block mt-1">
                {formatMoney(totalInvoiceOutstandingValue)}
              </span>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="p-4 border-b border-[#DFE6F1]">
              <h3 className="text-sm font-bold text-[#111827]">
                Invoice Audit Ledger
              </h3>
              <p className="text-xs text-[#7185A5]">
                Comparing billed deliverables against confirmed received settlements
              </p>
              {invoiceReport.error && <p className="text-xs text-[#E11D48] mt-1">{invoiceReport.error}</p>}
              {invoiceReportTruncated && (
                <p className="text-xs text-[#B45309] mt-1">Showing the first 200 invoices in this range; narrow the dates to see the rest.</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5]">
                  <tr>
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Client</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4 text-right">Invoiced</th>
                    <th className="py-2.5 px-4 text-right">Collected</th>
                    <th className="py-2.5 px-4 text-right">Outstanding</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {rangeInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-2.5 px-4 font-mono font-bold">{inv.invoiceNumber}</td>
                      <td className="py-2.5 px-4 font-medium">{inv.clientName}</td>
                      <td className="py-2.5 px-4 text-[#7185A5]">{formatDate(inv.invoiceDate)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatMoney(inv.total)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#047857]">{formatMoney(inv.amountPaid)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#B45309]">{formatMoney(inv.balance)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <InvoiceStatusBadge status={inv.derivedStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* REPORT 5: MONTHLY SALARY REPORT */}
      {activeReport === 'salary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Total Salary Committed</span>
              <span className="text-2xl font-mono font-bold text-[#111827] block mt-1">
                {formatCurrency(totalSalaryCommitted, CURRENCY)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Disbursed (Paid)</span>
              <span className="text-2xl font-mono font-bold text-[#047857] block mt-1">
                {formatCurrency(totalSalaryPaid, CURRENCY)}
              </span>
            </Card>
            <Card padding="md">
              <span className="text-xs font-semibold text-[#7185A5] block">Pending Payouts</span>
              <span className="text-2xl font-mono font-bold text-[#B45309] block mt-1">
                {formatCurrency(totalSalaryPending, CURRENCY)}
              </span>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="p-4 border-b border-[#DFE6F1]">
              <h3 className="text-sm font-bold text-[#111827]">
                Salary Payment Distribution
              </h3>
              <p className="text-xs text-[#7185A5]">
                Active team payroll records for the selected period
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5]">
                  <tr>
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4">Month</th>
                    <th className="py-2.5 px-4 text-right">Base</th>
                    <th className="py-2.5 px-4 text-right">Adjustments</th>
                    <th className="py-2.5 px-4 text-right">Payable</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4">Disbursed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {rangeSalaries.map(sal => (
                    <tr key={sal.id}>
                      <td className="py-2.5 px-4 font-semibold text-[#111827]">{sal.employeeName}</td>
                      <td className="py-2.5 px-4">{sal.department}</td>
                      <td className="py-2.5 px-4 text-[#7185A5] font-mono">{sal.salaryMonth}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(sal.baseSalary, CURRENCY)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(sal.adjustments, CURRENCY)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">{formatCurrency(sal.finalPayableAmount, CURRENCY)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge variant={sal.status === 'Paid' ? 'success' : 'warning'}>
                          {sal.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-[#7185A5]">{sal.paymentDate ? formatDate(sal.paymentDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
