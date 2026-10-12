import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Employee, Department, EmploymentStatus } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeToEdit?: Employee | null;
}

const DEPARTMENTS: Department[] = [
  'Engineering',
  'Design',
  'Marketing',
  'Operations',
  'Finance',
];

const STATUSES: EmploymentStatus[] = ['Active', 'On Leave', 'Inactive'];

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  employeeToEdit,
}) => {
  const { addEmployee, updateEmployee, settings } = useApp();

  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [department, setDepartment] = useState<Department>('Engineering');
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<EmploymentStatus>('Active');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (employeeToEdit) {
      setFullName(employeeToEdit.fullName);
      setWorkEmail(employeeToEdit.workEmail);
      setPhoneNumber(employeeToEdit.phoneNumber || '');
      setDepartment(employeeToEdit.department);
      setDesignation(employeeToEdit.designation);
      setJoiningDate(employeeToEdit.joiningDate);
      setStatus(employeeToEdit.status);
      setMonthlySalary(String(employeeToEdit.monthlySalary));
      setPaymentMethod(employeeToEdit.paymentMethod || 'Bank Transfer');
      setNotes(employeeToEdit.notes || '');
    } else {
      setFullName('');
      setWorkEmail('');
      setPhoneNumber('');
      setDepartment('Engineering');
      setDesignation('');
      setJoiningDate(new Date().toISOString().split('T')[0]);
      setStatus('Active');
      setMonthlySalary('120000');
      setPaymentMethod('Bank Transfer');
      setNotes('');
    }
    setError('');
  }, [employeeToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full Name is required');
      return;
    }
    if (!workEmail.trim() || !workEmail.includes('@')) {
      setError('A valid work email is required');
      return;
    }
    if (!designation.trim()) {
      setError('Designation is required');
      return;
    }
    const salaryNum = parseFloat(monthlySalary);
    if (isNaN(salaryNum) || salaryNum < 0) {
      setError('Monthly Salary must be a valid non-negative number');
      return;
    }

    if (employeeToEdit) {
      updateEmployee({
        ...employeeToEdit,
        fullName: fullName.trim(),
        workEmail: workEmail.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        department,
        designation: designation.trim(),
        joiningDate,
        status,
        monthlySalary: salaryNum,
        paymentMethod,
        notes: notes.trim() || undefined,
      });
    } else {
      addEmployee({
        fullName: fullName.trim(),
        workEmail: workEmail.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        department,
        designation: designation.trim(),
        joiningDate,
        status,
        monthlySalary: salaryNum,
        paymentMethod,
        notes: notes.trim() || undefined,
      });
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employeeToEdit ? 'Edit Employee Details' : 'Add New Employee'}
      description="Record internal employee profile and payroll base salary"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Full Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Work Email *
            </label>
            <input
              type="email"
              placeholder="rahul@hybridmonks.com"
              value={workEmail}
              onChange={e => setWorkEmail(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Department *
            </label>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value as Department)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Designation *
            </label>
            <input
              type="text"
              placeholder="e.g. Senior Frontend Engineer"
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Phone Number
            </label>
            <input
              type="text"
              placeholder="+91 98765 43210"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Joining Date *
            </label>
            <input
              type="date"
              value={joiningDate}
              onChange={e => setJoiningDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Employment Status *
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as EmploymentStatus)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Salary Information (Authorized only) */}
        <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#DFE6F1]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Monthly Base Salary ({settings.defaultCurrency}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="100000"
                value={monthlySalary}
                onChange={e => setMonthlySalary(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Disbursement Method
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-[#7185A5] mt-2">
            Base salary is used when generating monthly payroll records. Changes will not alter historical paid records.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1">
            Notes / Role Remarks
          </label>
          <input
            type="text"
            placeholder="Special skills, reporting line, etc."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md">
            {employeeToEdit ? 'Save Employee' : 'Add Employee'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
