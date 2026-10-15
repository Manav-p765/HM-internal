import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { employeesApi, EmployeeInput } from '../../api/employees';
import { ApiError, errorMessage } from '../../api/client';
import { DEPARTMENTS, Employee } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { CURRENCY } from '../../utils/money';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeToEdit?: Employee | null;
  // Called with the saved record; created is true for a new employee.
  onSaved: (employee: Employee, created: boolean) => void;
}

type FieldErrors = Partial<Record<keyof EmployeeInput, string>>;

const today = () => new Date().toISOString().split('T')[0];

const inputClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// Admin-only form. The employee code is assigned by the server.
export const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, employeeToEdit, onSaved }) => {
  
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState(today());
  const [status, setStatus] = useState<'active' | 'on_leave'>('active');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const isInactive = employeeToEdit?.status === 'inactive';

  useEffect(() => {
    if (!isOpen) return;
    const e = employeeToEdit;
    setFullName(e?.fullName ?? '');
    setWorkEmail(e?.workEmail ?? '');
    setPhone(e?.phone ?? '');
    setDepartment(e?.department ?? DEPARTMENTS[0]);
    setDesignation(e?.designation ?? '');
    setJoiningDate(e?.joiningDate ?? today());
    setStatus(e && e.status !== 'inactive' ? e.status : 'active');
    setMonthlySalary(e?.monthlySalary ?? '');
    setPaymentMethod(e?.paymentMethod ?? 'Bank Transfer');
    setNotes(e?.notes ?? '');
    setError('');
    setFieldErrors({});
    setIsSaving(false);
  }, [employeeToEdit, isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    const input: EmployeeInput = {
      fullName: fullName.trim(),
      workEmail: workEmail.trim(),
      phone: phone.trim() || null,
      department,
      designation: designation.trim(),
      joiningDate,
      monthlySalary: monthlySalary.trim(),
      paymentMethod: paymentMethod || null,
      notes: notes.trim() || null,
      // An inactive employee's status is changed with Reactivate, not here.
      ...(isInactive ? {} : { status }),
    };

    setIsSaving(true);
    try {
      const saved = employeeToEdit
        ? await employeesApi.update(employeeToEdit.id, input)
        : await employeesApi.create(input);
      onSaved(saved, !employeeToEdit);
      onClose();
    } catch (err) {
      // Show server validation messages next to their fields.
      if (err instanceof ApiError && err.details?.length) {
        const byField: FieldErrors = {};
        for (const detail of err.details) byField[detail.path as keyof EmployeeInput] ??= detail.message;
        setFieldErrors(byField);
      }
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employeeToEdit ? `Edit ${employeeToEdit.fullName} (${employeeToEdit.code})` : 'Add New Employee'}
      description="Record internal employee profile and payroll base salary"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Full Name" required error={fieldErrors.fullName}>
            <input
              aria-label="Full Name"
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className={inputClass}
              required
            />
          </FormField>
          <FormField label="Work Email" required error={fieldErrors.workEmail}>
            <input
              aria-label="Work Email"
              type="email"
              placeholder="name@hybridmonks.com"
              value={workEmail}
              onChange={e => setWorkEmail(e.target.value)}
              className={inputClass}
              required
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Department" required error={fieldErrors.department}>
            <select aria-label="Department" value={department} onChange={e => setDepartment(e.target.value)} className={inputClass}>
              {/* Keep an existing value that isn't in the standard list selectable. */}
              {[...new Set([...DEPARTMENTS, department])].map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Designation" required error={fieldErrors.designation}>
            <input
              aria-label="Designation"
              type="text"
              placeholder="e.g. Senior Frontend Engineer"
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              className={inputClass}
              required
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Phone Number" error={fieldErrors.phone}>
            <input
              aria-label="Phone Number"
              type="text"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Joining Date" required error={fieldErrors.joiningDate}>
            <input
              aria-label="Joining Date"
              type="date"
              value={joiningDate}
              onChange={e => setJoiningDate(e.target.value)}
              className={inputClass}
              required
            />
          </FormField>
          <FormField
            label="Employment Status"
            error={fieldErrors.status}
            hint={isInactive ? 'Inactive: use Reactivate in the list.' : undefined}
          >
            <select
              aria-label="Employment Status"
              value={isInactive ? 'inactive' : status}
              disabled={isInactive}
              onChange={e => setStatus(e.target.value as 'active' | 'on_leave')}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              {isInactive && <option value="inactive">Inactive</option>}
            </select>
          </FormField>
        </div>

        {/* Salary (admin only; the server never sends it to anyone else) */}
        <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#DFE6F1]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label={`Monthly Base Salary (${CURRENCY})`}
              required
              error={fieldErrors.monthlySalary}
            >
              <input
                aria-label="Monthly Base Salary"
                type="text"
                inputMode="decimal"
                placeholder="100000"
                value={monthlySalary}
                onChange={e => setMonthlySalary(e.target.value)}
                className={`${inputClass} font-mono`}
                required
              />
            </FormField>
            <FormField label="Disbursement Method" error={fieldErrors.paymentMethod}>
              <select
                aria-label="Disbursement Method"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className={inputClass}
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
              </select>
            </FormField>
          </div>
          <p className="text-[10px] text-[#7185A5] mt-2">
            Base salary is used when generating monthly payroll records. Changes will not alter historical paid records.
          </p>
        </div>

        <FormField label="Notes / Role Remarks" error={fieldErrors.notes}>
          <input
            aria-label="Notes"
            type="text"
            placeholder="Special skills, reporting line, etc."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className={inputClass}
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving...' : employeeToEdit ? 'Save Employee' : 'Add Employee'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
