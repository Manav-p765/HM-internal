import React from 'react';
import { Payslip } from '../../types/salary';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

// The payslip itself (detail modal and the A4 print page). Every amount is a server string; the only
// figures are base, the itemised lines, the total adjustments and the net, all from the API.
export const PayslipDocument: React.FC<{ slip: Payslip }> = ({ slip }) => {
  const earnings = slip.lines.filter(l => l.kind === 'earning');
  const deductions = slip.lines.filter(l => l.kind === 'deduction');

  return (
    <div className="space-y-6 text-[#111827]" data-testid="payslip">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-[#DFE6F1] print-row">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{slip.company.name}</h2>
          {slip.company.address && <p className="text-xs text-[#475569] whitespace-pre-line mt-0.5">{slip.company.address}</p>}
        </div>
        <div className="sm:text-right shrink-0">
          <span className="text-xs uppercase font-bold text-[#5038F5] tracking-wider block">Payslip</span>
          <span className="text-base font-bold">{formatMonthYear(slip.month)}</span>
        </div>
      </header>

      {/* Employee */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] text-xs print-grid-4">
        <div className="min-w-0">
          <span className="text-[#7185A5] block text-[11px]">Employee</span>
          <span className="font-bold break-words">{slip.employee.name}</span>
        </div>
        <div>
          <span className="text-[#7185A5] block text-[11px]">Employee code</span>
          <span className="font-mono font-medium">{slip.employee.code}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[#7185A5] block text-[11px]">Department</span>
          <span className="font-medium">{slip.employee.department}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[#7185A5] block text-[11px]">Designation</span>
          <span className="font-medium">{slip.employee.designation}</span>
        </div>
      </div>

      {/* Earnings and deductions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-row-grid">
        <section className="border border-[#DFE6F1] rounded-lg overflow-hidden">
          <h3 className="bg-[#F7F9FC] px-3.5 py-2 font-semibold text-xs border-b border-[#DFE6F1]">Earnings</h3>
          <div className="p-3.5 space-y-2 text-xs">
            <div className="flex justify-between gap-3 text-[#475569]">
              <span>Base salary</span>
              <span className="font-mono font-medium text-[#111827] whitespace-nowrap">{formatMoney(slip.baseSalary)}</span>
            </div>
            {earnings.map((line, i) => (
              <div key={i} className="flex justify-between gap-3 text-[#475569]">
                <span className="min-w-0 break-words">{line.label}</span>
                <span className="font-mono font-medium text-[#111827] whitespace-nowrap">{formatMoney(line.amount)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-[#DFE6F1] rounded-lg overflow-hidden">
          <h3 className="bg-[#F7F9FC] px-3.5 py-2 font-semibold text-xs border-b border-[#DFE6F1]">Deductions</h3>
          <div className="p-3.5 space-y-2 text-xs">
            {deductions.map((line, i) => (
              <div key={i} className="flex justify-between gap-3 text-[#475569]">
                <span className="min-w-0 break-words">{line.label}</span>
                <span className="font-mono font-medium text-[#E11D48] whitespace-nowrap">−{formatMoney(line.amount)}</span>
              </div>
            ))}
            {deductions.length === 0 && <div className="text-[#7185A5]">No deductions.</div>}
          </div>
        </section>
      </div>

      {/* Totals */}
      <div className="space-y-1.5 text-xs sm:w-80 sm:ml-auto">
        <div className="flex justify-between text-[#7185A5]">
          <span>Base salary</span>
          <span className="font-mono text-[#111827]">{formatMoney(slip.baseSalary)}</span>
        </div>
        <div className="flex justify-between text-[#7185A5]">
          <span>Adjustments (earnings − deductions)</span>
          <span className="font-mono text-[#111827]">{formatMoney(slip.adjustments)}</span>
        </div>
      </div>
      <div className="p-4 rounded-xl bg-[#047857]/5 border border-[#047857]/20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase text-[#047857] block">Net pay</span>
          <span className="text-[11px] text-[#475569]">
            Paid {formatDate(slip.paidOn)} · {slip.paymentMethod}
          </span>
        </div>
        <span className="text-xl sm:text-2xl font-mono font-bold text-[#047857] whitespace-nowrap" data-testid="payslip-net">
          {formatMoney(slip.netPayable)}
        </span>
      </div>

      <footer className="pt-4 border-t border-[#DFE6F1] text-[11px] text-[#7185A5]">
        Computer-generated payslip issued by {slip.company.name}. No signature required.
      </footer>
    </div>
  );
};
