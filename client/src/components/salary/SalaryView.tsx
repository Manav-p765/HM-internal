import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SalaryRecord, SalaryPaymentStatus, PaymentMethod } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import {
  Banknote,
  Plus,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Edit2,
  Calendar,
  CreditCard,
  AlertCircle,
  Download,
} from 'lucide-react';
import { formatCurrency, formatDate, formatMonthYear, exportToCSV } from '../../utils/formatters';
import { CURRENCY } from '../../utils/money';
import { COMPANY_BRAND } from '../../utils/company';

const PAYMENT_METHODS: PaymentMethod[] = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Cheque',
  'Cash',
];

export const SalaryView: React.FC = () => {
  const {
    salaries,
    generateMonthlySalaries,
    updateSalaryRecord,
    markSalaryPaid,
    publishSalarySlip,
    currentUser,
  } = useApp();

  // Current selected month: default to current month YYYY-MM
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | SalaryPaymentStatus>('all');
  const [search, setSearch] = useState('');

  // Modals
  const [salaryToEdit, setSalaryToEdit] = useState<SalaryRecord | null>(null);
  const [salaryToPay, setSalaryToPay] = useState<SalaryRecord | null>(null);
  const [paymentDate, setPaymentDate] = useState<string>(now.toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');

  // Edit form state
  const [editAdjustments, setEditAdjustments] = useState<string>('0');
  const [editNotes, setEditNotes] = useState<string>('');

  // List of distinct months available in salaries + current month
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthStr);
    salaries.forEach(s => set.add(s.salaryMonth));
    return Array.from(set).sort().reverse();
  }, [salaries, currentMonthStr]);

  // Filtered salaries for the selected month and search
  const filteredSalaries = useMemo(() => {
    return salaries.filter(s => {
      if (selectedMonth && s.salaryMonth !== selectedMonth) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = s.employeeName.toLowerCase().includes(query);
        const matchesDept = s.department.toLowerCase().includes(query);
        const matchesId = s.employeeId.toLowerCase().includes(query);
        if (!matchesName && !matchesDept && !matchesId) return false;
      }
      return true;
    });
  }, [salaries, selectedMonth, statusFilter, search]);

  // Month-specific KPIs
  const totalMonthPayable = useMemo(() => {
    return filteredSalaries.reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [filteredSalaries]);

  const totalMonthPaid = useMemo(() => {
    return filteredSalaries
      .filter(s => s.status === 'Paid')
      .reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [filteredSalaries]);

  const totalMonthPending = useMemo(() => {
    return filteredSalaries
      .filter(s => s.status === 'Pending')
      .reduce((sum, s) => sum + s.finalPayableAmount, 0);
  }, [filteredSalaries]);

  const handleGenerate = () => {
    generateMonthlySalaries(selectedMonth);
  };

  const handleOpenEdit = (salary: SalaryRecord) => {
    setSalaryToEdit(salary);
    setEditAdjustments(String(salary.adjustments));
    setEditNotes(salary.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryToEdit) return;
    const adj = parseFloat(editAdjustments) || 0;
    updateSalaryRecord({
      ...salaryToEdit,
      adjustments: adj,
      finalPayableAmount: salaryToEdit.baseSalary + adj,
      notes: editNotes.trim() || undefined,
    });
    setSalaryToEdit(null);
  };

  const handleOpenPay = (salary: SalaryRecord) => {
    setSalaryToPay(salary);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Bank Transfer');
  };

  const handleConfirmPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryToPay) return;
    markSalaryPaid(salaryToPay.id, paymentDate, paymentMethod);
    setSalaryToPay(null);
  };

  const handleExportCSV = () => {
    const headers = [
      'Record ID',
      'Employee ID',
      'Employee Name',
      'Department',
      'Salary Month',
      `Base Salary (${CURRENCY})`,
      `Adjustments (${CURRENCY})`,
      `Final Payable (${CURRENCY})`,
      'Status',
      'Disbursement Date',
      'Payment Method',
      'Linked Transaction ID',
      'Notes',
    ];

    const rows = filteredSalaries.map(s => [
      s.id,
      s.employeeId,
      s.employeeName,
      s.department,
      s.salaryMonth,
      s.baseSalary,
      s.adjustments,
      s.finalPayableAmount,
      s.status,
      s.paymentDate || '',
      s.paymentMethod || '',
      s.linkedExpenseTxnId || '',
      s.notes || '',
    ]);

    exportToCSV(`salary_payroll_${selectedMonth}_${COMPANY_BRAND.toLowerCase().replace(/\s+/g, '_')}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Salary & Monthly Payroll
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Generate monthly payroll records, record adjustments, and disburse salaries
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          {currentUser.role === 'admin' && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleGenerate}
            >
              Generate Records for {formatMonthYear(selectedMonth)}
            </Button>
          )}
        </div>
      </div>

      {/* Month Selector Strip */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-[#5038F5] shrink-0" />
            <span className="text-xs font-semibold text-[#111827] shrink-0">
              Payroll Month:
            </span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {formatMonthYear(m)} ({m})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search employee, ID, dept..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="text-xs px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending Only</option>
              <option value="Paid">Paid Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* KPI Cards for Selected Month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Total Payroll Commitment ({formatMonthYear(selectedMonth)})
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#111827]">
              {formatCurrency(totalMonthPayable, CURRENCY)}
            </span>
            <span className="text-xs text-[#7185A5]">
              {filteredSalaries.length} records
            </span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Disbursed / Paid
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">
              {formatCurrency(totalMonthPaid, CURRENCY)}
            </span>
            <span className="text-xs text-[#047857] font-medium">
              {filteredSalaries.filter(s => s.status === 'Paid').length} paid
            </span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Pending Payouts
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]">
              {formatCurrency(totalMonthPending, CURRENCY)}
            </span>
            <span className="text-xs text-[#B45309] font-medium">
              {filteredSalaries.filter(s => s.status === 'Pending').length} pending
            </span>
          </div>
        </Card>
      </div>

      {/* Salary Records Table */}
      <Card padding="none" className="overflow-hidden">
        {filteredSalaries.length === 0 ? (
          <EmptyState
            icon={<Banknote className="w-6 h-6" />}
            title={`No salary records for ${formatMonthYear(selectedMonth)}`}
            description="Generate payroll records for this month using active employee base salaries."
            actionLabel={currentUser.role === 'admin' ? `Generate ${formatMonthYear(selectedMonth)} Records` : undefined}
            onAction={handleGenerate}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-right">Base Salary</th>
                  <th className="py-3 px-4 text-right">Adjustments</th>
                  <th className="py-3 px-4 text-right">Final Payable</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Disbursed Date</th>
                  <th className="py-3 px-4">Linked Expense</th>
                  <th className="py-3 px-4 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredSalaries.map(sal => (
                  <tr key={sal.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#111827]">
                        {sal.employeeName}
                      </div>
                      <div className="font-mono text-[10px] text-[#7185A5]">
                        {sal.employeeId} · {sal.employeeEmail}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">
                      {sal.department}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#7185A5] whitespace-nowrap">
                      {formatCurrency(sal.baseSalary, CURRENCY)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                      {sal.adjustments > 0 ? (
                        <span className="text-[#047857]">
                          +{formatCurrency(sal.adjustments, CURRENCY)}
                        </span>
                      ) : sal.adjustments < 0 ? (
                        <span className="text-[#E11D48]">
                          {formatCurrency(sal.adjustments, CURRENCY)}
                        </span>
                      ) : (
                        <span className="text-[#7185A5]">₹0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#111827] whitespace-nowrap">
                      {formatCurrency(sal.finalPayableAmount, CURRENCY)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge variant={sal.status === 'Paid' ? 'success' : 'warning'}>
                        {sal.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {sal.paymentDate ? formatDate(sal.paymentDate) : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#5038F5] whitespace-nowrap">
                      {sal.linkedExpenseTxnId || '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {sal.status === 'Pending' && currentUser.role === 'admin' && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(sal)}
                              className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                              title="Edit Adjustments"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon={<CreditCard className="w-3 h-3" />}
                              onClick={() => handleOpenPay(sal)}
                            >
                              Pay
                            </Button>
                          </>
                        )}
                        {sal.status === 'Paid' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[#047857] flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Disbursed
                            </span>
                            <button
                              onClick={() => publishSalarySlip(sal.id)}
                              className="px-2 py-1 text-[11px] font-semibold text-[#5038F5] bg-[#5038F5]/10 hover:bg-[#5038F5]/20 rounded-md transition-colors cursor-pointer"
                              title="Publish/update payslip for employee viewing"
                            >
                              {sal.isSlipPublished ? 'Slip Published' : 'Publish Slip'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Salary Modal */}
      <Modal
        isOpen={!!salaryToEdit}
        onClose={() => setSalaryToEdit(null)}
        title="Adjust Payable Amount"
        description={`Employee: ${salaryToEdit?.employeeName} · Month: ${formatMonthYear(salaryToEdit?.salaryMonth || '')}`}
        maxWidth="md"
      >
        {salaryToEdit && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#DFE6F1] grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#7185A5] block">Current Base Salary</span>
                <span className="font-mono font-bold text-[#111827]">
                  {formatCurrency(salaryToEdit.baseSalary, CURRENCY)}
                </span>
              </div>
              <div>
                <span className="text-[#7185A5] block">Calculated Total</span>
                <span className="font-mono font-bold text-[#5038F5]">
                  {formatCurrency(
                    salaryToEdit.baseSalary + (parseFloat(editAdjustments) || 0),
                    CURRENCY
                  )}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Adjustments / Bonus / Deductions ({CURRENCY})
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 5000 for bonus or -2000 for deduction"
                value={editAdjustments}
                onChange={e => setEditAdjustments(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
              <span className="text-[10px] text-[#7185A5] mt-1 block">
                Enter positive value for bonuses or negative value for unpaid leave deductions.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Remarks / Notes
              </label>
              <input
                type="text"
                placeholder="Reason for adjustment"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
              <Button type="button" variant="outline" size="md" onClick={() => setSalaryToEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Update Payable
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Mark Salary Paid Modal */}
      <Modal
        isOpen={!!salaryToPay}
        onClose={() => setSalaryToPay(null)}
        title="Disburse Salary & Create Linked Expense"
        description={`Paying: ${salaryToPay?.employeeName} · Payable: ${formatCurrency(salaryToPay?.finalPayableAmount || 0, CURRENCY)}`}
        maxWidth="md"
      >
        {salaryToPay && (
          <form onSubmit={handleConfirmPay} className="space-y-4">
            <div className="p-3 bg-[#047857]/5 border border-[#047857]/20 rounded-lg text-xs space-y-1">
              <span className="font-semibold text-[#047857] block flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Atomic Accounting Integration
              </span>
              <p className="text-[#475569]">
                Marking this salary as paid will atomically generate a linked{' '}
                <strong className="text-[#111827]">Expense Transaction</strong> under category 'Salaries' with reference #{salaryToPay.id}. Duplicate expense entries are automatically prevented.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
              <Button type="button" variant="outline" size="md" onClick={() => setSalaryToPay(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Disburse & Record Expense
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
