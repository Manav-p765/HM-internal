import React from 'react';
import { useApp } from '../../context/AppContext';
import { Employee } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  Mail,
  Phone,
  Calendar,
  Building,
  CreditCard,
  Banknote,
  CheckCircle2,
  Clock,
  Edit2,
} from 'lucide-react';
import { formatCurrency, formatDate, formatMonthYear } from '../../utils/formatters';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onEdit: (emp: Employee) => void;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  isOpen,
  onClose,
  employee,
  onEdit,
}) => {
  const { salaries, currentUser, settings } = useApp();

  if (!employee) return null;

  // Filter salary history for this employee
  const employeeSalaries = salaries.filter(s => s.employeeId === employee.id);

  const canViewSalary = currentUser.role === 'admin' || currentUser.role === 'manager';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${employee.fullName} — Profile`}
      description={`ID: ${employee.id} · Department: ${employee.department}`}
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Profile Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#5038F5]/10 border border-[#DFE6F1] flex items-center justify-center font-bold text-base text-[#5038F5] shrink-0">
              {employee.avatarUrl ? (
                <img
                  src={employee.avatarUrl}
                  alt={employee.fullName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                employee.fullName.charAt(0)
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#111827]">
                  {employee.fullName}
                </h3>
                <Badge
                  variant={
                    employee.status === 'Active'
                      ? 'success'
                      : employee.status === 'On Leave'
                      ? 'warning'
                      : 'neutral'
                  }
                >
                  {employee.status}
                </Badge>
              </div>
              <p className="text-xs text-[#7185A5] mt-0.5">{employee.designation}</p>
            </div>
          </div>

          {currentUser.role !== 'employee' && (
            <Button
              variant="outline"
              size="sm"
              icon={<Edit2 className="w-3.5 h-3.5" />}
              onClick={() => {
                onClose();
                onEdit(employee);
              }}
            >
              Edit Employee
            </Button>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
            <Mail className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Work Email</span>
              <span className="font-medium text-[#111827]">{employee.workEmail}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
            <Phone className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Phone Number</span>
              <span className="font-medium text-[#111827]">
                {employee.phoneNumber || 'Not provided'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
            <Calendar className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Date of Joining</span>
              <span className="font-medium text-[#111827]">
                {formatDate(employee.joiningDate)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
            <CreditCard className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Payment Method</span>
              <span className="font-medium text-[#111827]">
                {employee.paymentMethod || 'Bank Transfer'}
              </span>
            </div>
          </div>
        </div>

        {/* Salary Information (Visible only to authorized roles) */}
        {canViewSalary ? (
          <div className="p-4 rounded-xl border border-[#DFE6F1] bg-white space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-[#5038F5]" />
                <span className="text-xs font-semibold text-[#111827]">
                  Monthly Base Compensation
                </span>
              </div>
              <span className="text-sm font-mono font-bold text-[#5038F5]">
                {formatCurrency(employee.monthlySalary, settings.defaultCurrency)} / month
              </span>
            </div>

            {/* Salary History */}
            <div>
              <span className="text-xs font-semibold text-[#111827] block mb-2">
                Salary Disbursement History ({employeeSalaries.length})
              </span>
              {employeeSalaries.length === 0 ? (
                <p className="text-xs text-[#7185A5] py-2">
                  No salary records generated yet for this employee.
                </p>
              ) : (
                <div className="border border-[#DFE6F1] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5]">
                      <tr>
                        <th className="py-2 px-3">Month</th>
                        <th className="py-2 px-3 text-right">Base</th>
                        <th className="py-2 px-3 text-right">Adjustments</th>
                        <th className="py-2 px-3 text-right">Payable</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3">Disbursed Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DFE6F1]">
                      {employeeSalaries.map(sal => (
                        <tr key={sal.id}>
                          <td className="py-2.5 px-3 font-medium text-[#111827]">
                            {formatMonthYear(sal.salaryMonth)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#7185A5]">
                            {formatCurrency(sal.baseSalary, settings.defaultCurrency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#7185A5]">
                            {sal.adjustments > 0 ? `+${formatCurrency(sal.adjustments, settings.defaultCurrency)}` : formatCurrency(sal.adjustments, settings.defaultCurrency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#111827]">
                            {formatCurrency(sal.finalPayableAmount, settings.defaultCurrency)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge variant={sal.status === 'Paid' ? 'success' : 'warning'}>
                              {sal.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-[#7185A5]">
                            {sal.paymentDate ? formatDate(sal.paymentDate) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-[#F1F5F9] rounded-lg text-center text-xs text-[#7185A5]">
            Compensation details are restricted to authorized management personnel.
          </div>
        )}

        {employee.notes && (
          <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white text-xs">
            <span className="font-semibold text-[#7185A5] block mb-1">Remarks</span>
            <p className="text-[#111827]">{employee.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
