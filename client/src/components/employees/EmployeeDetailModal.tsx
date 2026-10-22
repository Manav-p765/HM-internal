import React from 'react';
import { Link } from 'react-router';
import { employeesApi } from '../../api/employees';
import { useApiData } from '../../api/useApiData';
import { EMPLOYMENT_STATUS_LABEL, Employee, shiftLabel } from '../../types';
import { Avatar } from '../common/Avatar';
import { LoadError } from '../common/LoadError';
import { loginStatus, statusBadgeVariant } from './employeeDisplay';
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
import { formatDate } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

interface EmployeeDetailModalProps {
  employeeId: string; // from /employees/:id
  onClose: () => void;
  onEdit?: (emp: Employee) => void; // admins only
}

// Loads the employee itself so /employees/:id works as a direct link.
export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({ employeeId, onClose, onEdit }) => {
  const { data: employee, error, reload } = useApiData(() => employeesApi.get(employeeId), [employeeId]);

  if (!employee || employee.id !== employeeId) {
    return (
      <Modal isOpen onClose={onClose} title="Employee" size="xl">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : (
          <p className="py-10 text-center text-xs text-[#7185A5]" role="status">
            Loading...
          </p>
        )}
      </Modal>
    );
  }

  // The server only sends salary fields to admins.
  const canViewSalary = employee.monthlySalary !== undefined;
  const account = loginStatus(employee);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${employee.fullName} — Profile`}
      description={`${employee.code} · Department: ${employee.department}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Profile Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
          <div className="flex items-center gap-3.5">
            <Avatar name={employee.fullName} url={employee.avatarUrl} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#111827]">
                  {employee.fullName}
                </h3>
                <Badge variant={statusBadgeVariant(employee.status)}>{EMPLOYMENT_STATUS_LABEL[employee.status]}</Badge>
                <Badge variant={account.variant} size="sm">
                  Login: {account.label}
                </Badge>
              </div>
              <p className="text-xs text-[#7185A5] mt-0.5">{employee.designation}</p>
            </div>
          </div>

          {onEdit && (
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
                {employee.phone || 'Not provided'}
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
            <Clock className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Working Hours</span>
              <span className={`font-medium ${shiftLabel(employee) ? 'text-[#111827]' : 'text-[#B45309]'}`}>
                {shiftLabel(employee) ?? 'Not set yet'}
              </span>
            </div>
          </div>
          {canViewSalary && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
            <CreditCard className="w-4 h-4 text-[#7185A5]" />
            <div>
              <span className="text-[#7185A5] block text-[10px]">Payment Method</span>
              <span className="font-medium text-[#111827]">
                {employee.paymentMethod || 'Bank Transfer'}
              </span>
            </div>
          </div>
          )}
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
                {formatMoney(String(employee.monthlySalary))} / month
              </span>
            </div>

            {/* Monthly salary rows, payments and payslips are on the Salary page (admin). */}
            <p className="text-[11px] text-[#7185A5]">
              Monthly payroll, adjustments, payments and payslips are on the{' '}
              <Link to="/salary" className="text-[#5038F5] font-semibold hover:underline">
                Salary
              </Link>{' '}
              page.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-[#F1F5F9] rounded-lg text-center text-xs text-[#7185A5]">
            Compensation details are restricted to administrators.
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
