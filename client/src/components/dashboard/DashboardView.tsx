import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  Users,
  Banknote,
  ArrowRight,
  Plus,
  Calendar,
  Building,
  Clock,
  UserCheck,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

type DateFilterOption = 'this_month' | 'last_month' | 'this_year' | 'all_time';

export const DashboardView: React.FC = () => {
  const {
    transactions,
    invoices,
    employees,
    salaries,
    attendance,
    settings,
    setActiveTab,
    setIsAddTransactionOpen,
    setIsAddInvoiceOpen,
    currentUser,
  } = useApp();

  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');

  // Calculate date boundaries
  const dateRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    if (dateFilter === 'this_month') {
      const start = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      const end = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      return { start, end, label: 'This Month' };
    }

    if (dateFilter === 'last_month') {
      const start = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
      const end = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
      return { start, end, label: 'Last Month' };
    }

    if (dateFilter === 'this_year') {
      const start = `${currentYear}-01-01`;
      const end = `${currentYear}-12-31`;
      return { start, end, label: 'This Year' };
    }

    // All time
    return { start: '1970-01-01', end: '2099-12-31', label: 'All Time' };
  }, [dateFilter]);

  // Filtered transactions for calculation
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
  }, [transactions, dateRange]);

  // Financial calculations strictly per master prompt instructions:
  // - Total Income = sum of recorded income transactions
  // - Total Expenses = sum of recorded expense transactions
  // - Net Balance = Total Income minus Total Expenses
  // - Outstanding Invoices = total unpaid and partially unpaid invoice balances
  // - Pending Salary Payments = recorded salary amounts that have not been marked as paid
  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const totalExpenses = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const netBalance = totalIncome - totalExpenses;

  const outstandingInvoicesTotal = useMemo(() => {
    return invoices
      .filter(i => i.status !== 'Cancelled')
      .reduce((sum, i) => sum + i.outstandingAmount, 0);
  }, [invoices]);

  const pendingSalaryTotal = useMemo(() => {
    return salaries
      .filter(s => s.status === 'Pending')
      .reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [salaries]);

  const totalEmployeesCount = employees.length;
  const activeEmployeesCount = employees.filter(e => e.status === 'Active').length;

  // Operational metrics for Manager role
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendanceRecords = useMemo(() => {
    return attendance.filter(a => a.date === todayStr);
  }, [attendance, todayStr]);

  const currentlyWorkingCount = todayAttendanceRecords.filter(r => !r.punchOut).length;
  const presentTodayCount = todayAttendanceRecords.filter(
    r => r.punchOut || r.status === 'Working' || r.status === 'Late'
  ).length;
  const pendingInvoicesCount = invoices.filter(
    i => i.status === 'Sent' || i.status === 'Partially Paid' || i.status === 'Overdue'
  ).length;
  const attendanceRate = Math.round(
    (presentTodayCount / Math.max(1, activeEmployeesCount)) * 100
  );

  // Monthly Income vs Expenses breakdown for the last 6 months
  const monthlyBarData = useMemo(() => {
    const months: { [key: string]: { label: string; income: number; expense: number } } = {};
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      months[key] = { label, income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (months[monthKey]) {
        if (t.type === 'income') months[monthKey].income += t.amount;
        if (t.type === 'expense') months[monthKey].expense += t.amount;
      }
    });

    return Object.values(months);
  }, [transactions]);

  const maxMonthlyVal = Math.max(
    ...monthlyBarData.map(m => Math.max(m.income, m.expense)),
    100000
  );

  const isManager = currentUser.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            {isManager ? 'Operational Dashboard' : 'Overview & Financial Status'}
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            {isManager
              ? `Team attendance, client invoicing, and operations overview for ${settings.companyName}`
              : `Real-time accounting, payroll, and invoice balances for ${settings.companyName}`}
          </p>
        </div>

        {/* Date Filter Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg shadow-xs self-start sm:self-auto">
          {(
            [
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'all_time', label: 'All Time' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setDateFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                dateFilter === tab.id
                  ? 'bg-[#5038F5] text-white shadow-xs'
                  : 'text-[#7185A5] hover:text-[#111827]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isManager ? (
          <>
            {/* 1. Outstanding Invoices */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Outstanding Invoices</span>
                <div className="w-8 h-8 rounded-lg bg-[#B45309]/10 text-[#B45309] flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#B45309]">
                  {formatCurrency(outstandingInvoicesTotal, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Uncollected client account balances
                </p>
              </div>
            </Card>

            {/* 2. Team Present Today */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Team Present Today</span>
                <div className="w-8 h-8 rounded-lg bg-[#047857]/10 text-[#047857] flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#047857]">
                  {presentTodayCount} <span className="text-base text-[#7185A5] font-normal">/ {activeEmployeesCount}</span>
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Team members punched in for today's shift
                </p>
              </div>
            </Card>

            {/* 3. Currently Clocked In */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Currently Working</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#5038F5]">
                  {currentlyWorkingCount}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Active team members on the clock right now
                </p>
              </div>
            </Card>

            {/* 4. Pending Invoices */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Active Invoices</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {pendingInvoicesCount}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Client invoices sent, partial or overdue
                </p>
              </div>
            </Card>

            {/* 5. Total Employees */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Team Headcount</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {totalEmployeesCount}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  {activeEmployeesCount} active team members on staff roster
                </p>
              </div>
            </Card>

            {/* 6. Shift Compliance */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Shift Attendance Rate</span>
                <div className="w-8 h-8 rounded-lg bg-[#047857]/10 text-[#047857] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {attendanceRate}%
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Today's team attendance compliance
                </p>
              </div>
            </Card>
          </>
        ) : (
          <>
            {/* Total Income */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Total Income</span>
                <div className="w-8 h-8 rounded-lg bg-[#047857]/10 text-[#047857] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {formatCurrency(totalIncome, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Recorded revenue · {dateRange.label}
                </p>
              </div>
            </Card>

            {/* Total Expenses */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Total Expenses</span>
                <div className="w-8 h-8 rounded-lg bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {formatCurrency(totalExpenses, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Payroll, infra & operations · {dateRange.label}
                </p>
              </div>
            </Card>

            {/* Net Balance */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Net Balance</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span
                  className={`text-2xl font-mono font-bold ${
                    netBalance >= 0 ? 'text-[#047857]' : 'text-[#E11D48]'
                  }`}
                >
                  {formatCurrency(netBalance, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Net operating profit for {dateRange.label}
                </p>
              </div>
            </Card>

            {/* Outstanding Invoices */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Outstanding Invoices</span>
                <div className="w-8 h-8 rounded-lg bg-[#B45309]/10 text-[#B45309] flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#B45309]">
                  {formatCurrency(outstandingInvoicesTotal, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Unpaid and partially paid client balances
                </p>
              </div>
            </Card>

            {/* Total Employees */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Total Employees</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {totalEmployeesCount}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  {activeEmployeesCount} active team members on roster
                </p>
              </div>
            </Card>

            {/* Pending Salary Payments */}
            <Card padding="md" className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7185A5]">Pending Salary Payments</span>
                <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-mono font-bold text-[#111827]">
                  {formatCurrency(pendingSalaryTotal, settings.defaultCurrency)}
                </span>
                <p className="text-[11px] text-[#7185A5] mt-1">
                  Unpaid approved salary amounts for payroll
                </p>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Middle Block: Chart for Admin, Operations Snapshot for Manager */}
      {isManager ? (
        <Card padding="lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Today's Team Attendance & Shift Status
              </h3>
              <p className="text-xs text-[#7185A5]">
                Live shift monitoring and compliance tracking for active staff members
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Clock className="w-3.5 h-3.5" />}
              onClick={() => setActiveTab('attendance')}
            >
              Open Full Attendance Roster
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
              <div className="text-xs font-semibold text-[#7185A5]">Today's Shift Rate</div>
              <div className="text-2xl font-mono font-bold text-[#111827] mt-1">
                {attendanceRate}%
              </div>
              <div className="w-full bg-[#DFE6F1] h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-[#5038F5] h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, attendanceRate)}%` }}
                />
              </div>
              <p className="text-[11px] text-[#7185A5] mt-2">
                {presentTodayCount} out of {activeEmployeesCount} team members present today
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
              <div className="text-xs font-semibold text-[#7185A5]">Currently Clocked In</div>
              <div className="text-2xl font-mono font-bold text-[#047857] mt-1">
                {currentlyWorkingCount}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#047857] font-semibold mt-3">
                <span className="w-2 h-2 rounded-full bg-[#047857] animate-pulse" />
                Live on shift right now
              </div>
              <p className="text-[11px] text-[#7185A5] mt-1">
                Real-time active work sessions being recorded
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
              <div className="text-xs font-semibold text-[#7185A5]">Pending Client Billing</div>
              <div className="text-2xl font-mono font-bold text-[#B45309] mt-1">
                {formatCurrency(outstandingInvoicesTotal, settings.defaultCurrency)}
              </div>
              <p className="text-[11px] text-[#7185A5] mt-3">
                {pendingInvoicesCount} invoices pending payment or overdue
              </p>
              <button
                onClick={() => setActiveTab('invoices')}
                className="text-[11px] font-semibold text-[#5038F5] hover:underline mt-1 block cursor-pointer"
              >
                Review invoices &rarr;
              </button>
            </div>
          </div>
        </Card>
      ) : (
        /* Monthly Income vs Expenses Chart */
        <Card padding="lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Monthly Income vs Expenses
              </h3>
              <p className="text-xs text-[#7185A5]">
                6-month cash flow trajectory across recorded business transactions
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#5038F5]" />
                <span className="text-[#111827]">Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#DFE6F1]" />
                <span className="text-[#7185A5]">Expenses</span>
              </div>
            </div>
          </div>

          {/* Visual Bar Chart */}
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2 sm:gap-6 items-end h-44 pt-4 border-b border-[#DFE6F1]">
              {monthlyBarData.map((m, idx) => {
                const incomeHeight = maxMonthlyVal > 0 ? (m.income / maxMonthlyVal) * 100 : 0;
                const expenseHeight = maxMonthlyVal > 0 ? (m.expense / maxMonthlyVal) * 100 : 0;

                return (
                  <div key={idx} className="flex flex-col items-center h-full justify-end group">
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-full">
                      {/* Income bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-[#5038F5] rounded-t transition-all group-hover:brightness-110 relative"
                        style={{ height: `${Math.max(incomeHeight, 4)}%` }}
                        title={`Income: ${formatCurrency(m.income, settings.defaultCurrency)}`}
                      />
                      {/* Expense bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-[#DFE6F1] rounded-t transition-all group-hover:bg-[#CBD5E1] relative"
                        style={{ height: `${Math.max(expenseHeight, 4)}%` }}
                        title={`Expense: ${formatCurrency(m.expense, settings.defaultCurrency)}`}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-[#7185A5] mt-2">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tabular details below chart for accessibility & precision */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 text-center text-xs">
              {monthlyBarData.map((m, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                  <div className="font-semibold text-[#111827]">{m.label}</div>
                  <div className="font-mono text-[#047857] text-[11px] mt-0.5">
                    +{formatCurrency(m.income, settings.defaultCurrency)}
                  </div>
                  <div className="font-mono text-[#E11D48] text-[11px]">
                    -{formatCurrency(m.expense, settings.defaultCurrency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Main Content Sections: Left Column & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isManager ? (
          /* Today's Team Clock-ins for Manager */
          <Card padding="md">
            <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
              <div>
                <h3 className="text-sm font-bold text-[#111827]">Today's Team Clock-ins</h3>
                <p className="text-xs text-[#7185A5]">Staff punch-in timeline for today</p>
              </div>
              <button
                onClick={() => setActiveTab('attendance')}
                className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Manage Attendance <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#DFE6F1] mt-1">
              {todayAttendanceRecords.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#7185A5]">
                  No team members clocked in yet today.
                </div>
              ) : (
                todayAttendanceRecords.slice(0, 5).map(record => (
                  <div key={record.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#111827] truncate">
                        {record.employeeName}
                      </div>
                      <div className="text-[11px] text-[#7185A5] mt-0.5 flex items-center gap-1.5">
                        <span>{record.department}</span>
                        <span>·</span>
                        <span>In: {new Date(record.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant={
                          record.status === 'Working'
                            ? 'purple'
                            : record.status === 'Present'
                            ? 'success'
                            : record.status === 'Late'
                            ? 'warning'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {record.status}
                      </Badge>
                      <div className="text-[10px] text-[#7185A5] mt-0.5">
                        {Math.floor(record.durationMinutes / 60)}h {record.durationMinutes % 60}m
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : (
          /* Recent Transactions for Admin */
          <Card padding="md">
            <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
              <div>
                <h3 className="text-sm font-bold text-[#111827]">Recent Transactions</h3>
                <p className="text-xs text-[#7185A5]">Latest income and expense entries</p>
              </div>
              <button
                onClick={() => setActiveTab('accounting')}
                className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#DFE6F1] mt-1">
              {transactions.slice(0, 5).map(txn => (
                <div key={txn.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111827] truncate">
                      {txn.description}
                    </div>
                    <div className="text-[11px] text-[#7185A5] mt-0.5 flex items-center gap-1.5">
                      <span>{formatDate(txn.date)}</span>
                      <span>·</span>
                      <span>{txn.category}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-mono font-bold ${
                        txn.type === 'income' ? 'text-[#047857]' : 'text-[#111827]'
                      }`}
                    >
                      {txn.type === 'income' ? '+' : '-'}
                      {formatCurrency(txn.amount, settings.defaultCurrency)}
                    </span>
                    <div className="text-[10px] text-[#7185A5] mt-0.5">
                      {txn.paymentMethod}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Recent Invoices */}
        <Card padding="md">
          <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Recent Invoices</h3>
              <p className="text-xs text-[#7185A5]">Client billing and payment status</p>
            </div>
            <button
              onClick={() => setActiveTab('invoices')}
              className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              View Invoices <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#DFE6F1] mt-1">
            {invoices.slice(0, 5).map(inv => (
              <div key={inv.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#111827]">
                      {inv.invoiceNumber}
                    </span>
                    <Badge
                      variant={
                        inv.status === 'Paid'
                          ? 'success'
                          : inv.status === 'Overdue'
                          ? 'error'
                          : inv.status === 'Partially Paid'
                          ? 'warning'
                          : 'purple'
                      }
                      size="sm"
                    >
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-[#7185A5] mt-0.5 truncate">
                    {inv.clientName} · Due {formatDate(inv.dueDate)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-[#111827]">
                    {formatCurrency(inv.totalAmount, settings.defaultCurrency)}
                  </span>
                  {inv.outstandingAmount > 0 && (
                    <div className="text-[10px] font-mono text-[#E11D48] mt-0.5">
                      Due: {formatCurrency(inv.outstandingAmount, settings.defaultCurrency)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Employee Overview Row */}
      <Card padding="md">
        <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Team Distribution</h3>
            <p className="text-xs text-[#7185A5]">Department breakdown & headcount</p>
          </div>
          <button
            onClick={() => setActiveTab('employees')}
            className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
          >
            Manage Team <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          {(['Engineering', 'Design', 'Marketing', 'Operations', 'Finance'] as const).map(dept => {
            const count = employees.filter(e => e.department === dept).length;
            return (
              <div
                key={dept}
                className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] flex flex-col justify-between"
              >
                <span className="text-xs text-[#7185A5] font-medium">{dept}</span>
                <div className="text-lg font-mono font-bold text-[#111827] mt-2">
                  {count} <span className="text-[11px] font-normal text-[#7185A5]">members</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
