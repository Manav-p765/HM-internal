import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SalarySlip } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import {
  FileText,
  Printer,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Building,
} from 'lucide-react';
import { formatCurrency, formatDate, formatMonthYear } from '../../utils/formatters';
import { CURRENCY } from '../../utils/money';
import { COMPANY_BRAND } from '../../utils/company';

export const EmployeeSalarySlipsView: React.FC = () => {
  const { mySalarySlips, currentUser } = useApp();

  const [selectedSlip, setSelectedSlip] = useState<SalarySlip | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Month filter list
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    mySalarySlips.forEach(s => set.add(s.salaryMonth));
    return Array.from(set).sort().reverse();
  }, [mySalarySlips]);

  const filteredSlips = useMemo(() => {
    return mySalarySlips.filter(s => {
      if (selectedMonth !== 'all' && s.salaryMonth !== selectedMonth) return false;
      return true;
    });
  }, [mySalarySlips, selectedMonth]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            My Salary Slips
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Published compensation statements, earnings breakdowns, and payment vouchers
          </p>
        </div>
      </div>

      {/* Month Filter */}
      {availableMonths.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#5038F5]" />
            <span className="text-xs font-semibold text-[#111827]">Filter Month:</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Published Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {formatMonthYear(m)}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {/* Slips Listing */}
      <Card padding="none" className="overflow-hidden">
        {filteredSlips.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No published salary slips"
            description="Your monthly compensation statements will appear here once finalized and published by management."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Pay Period</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4 text-right">Basic Pay</th>
                  <th className="py-3 px-4 text-right">Net Compensation</th>
                  <th className="py-3 px-4 text-center">Payment Status</th>
                  <th className="py-3 px-4">Disbursed Date</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredSlips.map(slip => (
                  <tr key={slip.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#111827]">
                      {formatMonthYear(slip.salaryMonth)}
                      <span className="font-mono text-[10px] text-[#7185A5] block">
                        {slip.id}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {formatDate(slip.issueDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#7185A5] whitespace-nowrap">
                      {formatCurrency(slip.basicSalary, CURRENCY)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#047857] whitespace-nowrap text-sm">
                      {formatCurrency(slip.netPayable, CURRENCY)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge variant={slip.paymentStatus === 'Paid' ? 'success' : 'warning'}>
                        {slip.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {slip.paymentDate ? formatDate(slip.paymentDate) : 'Pending'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => setSelectedSlip(slip)}
                      >
                        View Slip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Printable Salary Slip Modal */}
      <Modal
        isOpen={!!selectedSlip}
        onClose={() => setSelectedSlip(null)}
        title={`Salary Slip — ${formatMonthYear(selectedSlip?.salaryMonth || '')}`}
        description="Official Hybrid Monks employee compensation statement"
        maxWidth="2xl"
      >
        {selectedSlip && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex items-center justify-between no-print pb-3 border-b border-[#DFE6F1]">
              <div className="flex items-center gap-2">
                <Badge variant={selectedSlip.paymentStatus === 'Paid' ? 'success' : 'warning'}>
                  {selectedSlip.paymentStatus}
                </Badge>
                <span className="text-xs text-[#7185A5]">
                  Issue Date: {formatDate(selectedSlip.issueDate)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<Printer className="w-3.5 h-3.5" />}
                onClick={handlePrint}
              >
                Print / Save PDF
              </Button>
            </div>

            {/* Official Slip Document */}
            <div className="bg-white border border-[#DFE6F1] rounded-xl p-6 sm:p-8 space-y-6">
              {/* Slip Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-[#DFE6F1]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-[#5038F5] text-white flex items-center justify-center font-bold text-sm">
                      M
                    </div>
                    <span className="text-lg font-bold text-[#111827]">
                      {COMPANY_BRAND}
                    </span>
                  </div>
                </div>

                <div className="sm:text-right">
                  <span className="text-xs uppercase font-bold text-[#5038F5] tracking-wider block">
                    Payslip For
                  </span>
                  <span className="text-base font-bold text-[#111827]">
                    {formatMonthYear(selectedSlip.salaryMonth)}
                  </span>
                  <div className="text-xs text-[#7185A5] mt-1 font-mono">
                    Ref: {selectedSlip.id}
                  </div>
                </div>
              </div>

              {/* Employee Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] text-xs">
                <div>
                  <span className="text-[#7185A5] block text-[11px]">Employee Name</span>
                  <span className="font-bold text-[#111827]">{selectedSlip.employeeName}</span>
                </div>
                <div>
                  <span className="text-[#7185A5] block text-[11px]">Employee ID</span>
                  <span className="font-mono font-medium text-[#111827]">{selectedSlip.employeeId}</span>
                </div>
                <div>
                  <span className="text-[#7185A5] block text-[11px]">Department</span>
                  <span className="font-medium text-[#111827]">{selectedSlip.department}</span>
                </div>
                <div>
                  <span className="text-[#7185A5] block text-[11px]">Payment Mode</span>
                  <span className="font-medium text-[#111827]">{selectedSlip.paymentMethod || 'Bank Transfer'}</span>
                </div>
              </div>

              {/* Earnings & Deductions Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Earnings */}
                <div className="border border-[#DFE6F1] rounded-lg overflow-hidden">
                  <div className="bg-[#F7F9FC] px-3.5 py-2 font-semibold text-xs text-[#111827] border-b border-[#DFE6F1]">
                    Earnings & Allowances
                  </div>
                  <div className="p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between text-[#475569]">
                      <span>Basic Salary</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {formatCurrency(selectedSlip.basicSalary, CURRENCY)}
                      </span>
                    </div>
                    {selectedSlip.allowances.map((a, i) => (
                      <div key={i} className="flex justify-between text-[#475569]">
                        <span>{a.title}</span>
                        <span className="font-mono font-medium text-[#111827]">
                          {formatCurrency(a.amount, CURRENCY)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Deductions */}
                <div className="border border-[#DFE6F1] rounded-lg overflow-hidden">
                  <div className="bg-[#F7F9FC] px-3.5 py-2 font-semibold text-xs text-[#111827] border-b border-[#DFE6F1]">
                    Deductions & Taxes
                  </div>
                  <div className="p-3.5 space-y-2 text-xs">
                    {selectedSlip.deductions.map((d, i) => (
                      <div key={i} className="flex justify-between text-[#475569]">
                        <span>{d.title}</span>
                        <span className="font-mono font-medium text-[#E11D48]">
                          -{formatCurrency(d.amount, CURRENCY)}
                        </span>
                      </div>
                    ))}
                    {selectedSlip.deductions.length === 0 && (
                      <div className="text-xs text-[#7185A5] py-2">No deductions applicable.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Net Pay Box */}
              <div className="p-4 rounded-xl bg-[#047857]/5 border border-[#047857]/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-[#047857] block">
                    Net Take-Home Pay
                  </span>
                  <span className="text-[11px] text-[#7185A5]">
                    Transferred to registered salary account
                  </span>
                </div>
                <span className="text-2xl font-mono font-bold text-[#047857]">
                  {formatCurrency(selectedSlip.netPayable, CURRENCY)}
                </span>
              </div>

              {/* Footer Signature */}
              <div className="pt-4 border-t border-[#DFE6F1] flex justify-between items-end text-xs text-[#7185A5]">
                <div>
                  <span className="block">Computer generated document.</span>
                  <span>Issued by {COMPANY_BRAND} Accounts & Payroll Division.</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-[#111827] block">Authorized Signatory</span>
                  <span>Hybrid Monks Finance</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
