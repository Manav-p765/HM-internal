import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { leavesApi } from '../../api/leaves';
import { ApiError, errorMessage } from '../../api/client';
import { DayType, HalfDayPeriod, LEAVE_TYPE_LABEL, LEAVE_TYPES, LeaveRequest, LeaveType } from '../../types/attendance';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { AlertCircle, Info } from 'lucide-react';
import { countWeekdays } from '../../utils/formatters';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (leave: LeaveRequest) => void;
  // The server's IST date (default start date) and the caller's own requests (for the overlap preview).
  today: string;
  myLeaves: LeaveRequest[];
  leaveToEdit?: LeaveRequest | null;
}

const inputClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] disabled:bg-[#F7F9FC] disabled:cursor-not-allowed';

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({ isOpen, onClose, onSaved, today, myLeaves, leaveToEdit }) => {
  const { showToast } = useApp();
  const [leaveType, setLeaveType] = useState<LeaveType>('casual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dayType, setDayType] = useState<DayType>('full');
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod>('first');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLeaveType(leaveToEdit?.leaveType ?? 'casual');
    setStartDate(leaveToEdit?.startDate ?? today);
    setEndDate(leaveToEdit?.endDate ?? today);
    setDayType(leaveToEdit?.dayType ?? 'full');
    setHalfDayPeriod(leaveToEdit?.halfDayPeriod ?? 'first');
    setReason(leaveToEdit?.reason ?? '');
    setErrors({});
    setFormError('');
  }, [isOpen, leaveToEdit, today]);

  // A half day is a single date.
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (dayType === 'half' || endDate < value) setEndDate(value);
  };
  const handleDayTypeChange = (value: DayType) => {
    setDayType(value);
    if (value === 'half') setEndDate(startDate);
  };

  // Preview only; the server computes and stores total days.
  const calculatedDays = useMemo(() => {
    if (dayType === 'half') return countWeekdays(startDate, startDate) * 0.5;
    return countWeekdays(startDate, endDate);
  }, [startDate, endDate, dayType]);

  const overlapWarning = useMemo(() => {
    const overlaps = myLeaves.some(
      l => l.id !== leaveToEdit?.id && (l.status === 'pending' || l.status === 'approved') && startDate <= l.endDate && endDate >= l.startDate,
    );
    return overlaps ? 'You already have a pending or approved leave request overlapping these dates.' : null;
  }, [startDate, endDate, myLeaves, leaveToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (!reason.trim()) {
      setErrors({ reason: 'A reason is required' });
      return;
    }
    const input = { leaveType, startDate, endDate, dayType, halfDayPeriod: dayType === 'half' ? halfDayPeriod : null, reason: reason.trim() };
    setIsSubmitting(true);
    try {
      const saved = leaveToEdit ? await leavesApi.update(leaveToEdit.id, input) : await leavesApi.apply(input);
      showToast('success', leaveToEdit ? 'Leave request updated.' : `Leave request for ${saved.totalDays} day(s) submitted for approval.`);
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map(d => [d.path, d.message])));
      else setFormError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleClass = (active: boolean) =>
    `py-2 px-3 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
      active ? 'bg-[#5038F5]/10 border-[#5038F5] text-[#5038F5] font-semibold' : 'bg-white border-[#DFE6F1] text-[#7185A5] hover:bg-[#F7F9FC]'
    }`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={leaveToEdit ? 'Edit Pending Leave Request' : 'Apply for Leave'} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {formError && (
          <div className="p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 flex items-start gap-2.5 text-xs text-[#E11D48]" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}
        {overlapWarning && !formError && (
          <div className="p-3 rounded-lg bg-[#B45309]/10 border border-[#B45309]/20 flex items-start gap-2.5 text-xs text-[#B45309]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{overlapWarning}</span>
          </div>
        )}

        <FormField label="Leave Category" required error={errors.leaveType}>
          <select value={leaveType} onChange={e => setLeaveType(e.target.value as LeaveType)} className={inputClass}>
            {LEAVE_TYPES.map(type => (
              <option key={type} value={type}>
                {LEAVE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Duration Format" required>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => handleDayTypeChange('full')} className={toggleClass(dayType === 'full')}>
              Full Day
            </button>
            <button type="button" onClick={() => handleDayTypeChange('half')} className={toggleClass(dayType === 'half')}>
              Half Day (0.5 day)
            </button>
          </div>
        </FormField>

        {dayType === 'half' && (
          <FormField label="Half Day Session" required error={errors.halfDayPeriod}>
            <div className="grid grid-cols-2 gap-3">
              {(['first', 'second'] as HalfDayPeriod[]).map(period => (
                <label key={period} className="flex items-center gap-2 p-2 rounded-lg border border-[#DFE6F1] text-xs cursor-pointer hover:bg-[#F7F9FC]">
                  <input type="radio" name="halfDayPeriod" checked={halfDayPeriod === period} onChange={() => setHalfDayPeriod(period)} />
                  <span className="font-medium text-[#111827]">{period === 'first' ? 'First Half (Morning)' : 'Second Half (Afternoon)'}</span>
                </label>
              ))}
            </div>
          </FormField>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Start Date" required error={errors.startDate}>
            <input type="date" required value={startDate} onChange={e => handleStartDateChange(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="End Date" required error={errors.endDate}>
            <input
              type="date"
              required
              disabled={dayType === 'half'}
              min={startDate}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="p-3 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[#5038F5]">
            <Info className="w-4 h-4 shrink-0" />
            <span>Working days (weekends excluded):</span>
          </div>
          <span className="text-sm font-mono font-bold text-[#5038F5]">
            {calculatedDays} {calculatedDays === 1 ? 'day' : 'days'}
          </span>
        </div>

        <FormField label="Reason for Leave" required error={errors.reason}>
          <textarea
            rows={3}
            placeholder="Please provide the purpose or reason for taking leave..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full text-xs p-3 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] resize-none"
          />
        </FormField>
        <p className="text-[10px] text-[#7185A5] -mt-2">Only you, managers and admins can see the reason.</p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || !!overlapWarning || calculatedDays <= 0}>
            {isSubmitting ? 'Submitting...' : leaveToEdit ? 'Save Changes' : 'Submit Leave Application'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
