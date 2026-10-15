import React from 'react';
import { HALF_DAY_LABEL, LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, LeaveRequest, LeaveStatus } from '../../types/attendance';
import { CheckCircle2, Clock, User, XCircle } from 'lucide-react';
import { formatDate, formatDateIst } from '../../utils/formatters';

export const LEAVE_STATUS_VARIANT: Record<LeaveStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  cancelled: 'neutral',
};

export const dayTypeLabel = (l: Pick<LeaveRequest, 'dayType' | 'halfDayPeriod'>) =>
  l.dayType === 'half' && l.halfDayPeriod ? `Half Day (${HALF_DAY_LABEL[l.halfDayPeriod]})` : 'Full Day';

export const daysLabel = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

// The body of the "view request" modal, shared by the employee's and the reviewer's pages.
export const LeaveDetails: React.FC<{ leave: LeaveRequest; showEmployee?: boolean }> = ({ leave, showEmployee }) => (
  <div className="space-y-4 pt-1 text-xs">
    <div
      className={`p-3.5 rounded-xl border flex items-center justify-between ${
        leave.status === 'approved'
          ? 'bg-[#047857]/10 border-[#047857]/20 text-[#047857]'
          : leave.status === 'pending'
          ? 'bg-[#B45309]/10 border-[#B45309]/20 text-[#B45309]'
          : leave.status === 'rejected'
          ? 'bg-[#E11D48]/10 border-[#E11D48]/20 text-[#E11D48]'
          : 'bg-gray-100 border-gray-200 text-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {leave.status === 'approved' && <CheckCircle2 className="w-4 h-4" />}
        {leave.status === 'pending' && <Clock className="w-4 h-4" />}
        {leave.status === 'rejected' && <XCircle className="w-4 h-4" />}
        <span>Status: {LEAVE_STATUS_LABEL[leave.status]}</span>
      </div>
      <span className="font-mono text-[11px] opacity-75">Applied on {formatDateIst(leave.appliedAt)}</span>
    </div>

    <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
      {showEmployee && (
        <>
          <div>
            <span className="text-[#7185A5] block">Employee</span>
            <span className="font-bold text-[#111827] mt-0.5 block">
              {leave.employeeName} ({leave.employeeCode})
            </span>
          </div>
          <div>
            <span className="text-[#7185A5] block">Department</span>
            <span className="font-bold text-[#111827] mt-0.5 block">{leave.department}</span>
          </div>
        </>
      )}
      <div className={showEmployee ? 'pt-2 border-t border-[#DFE6F1]' : ''}>
        <span className="text-[#7185A5] block">Leave Type</span>
        <span className="font-bold text-[#111827] mt-0.5 block">{LEAVE_TYPE_LABEL[leave.leaveType]}</span>
      </div>
      <div className={showEmployee ? 'pt-2 border-t border-[#DFE6F1]' : ''}>
        <span className="text-[#7185A5] block">Duration Format</span>
        <span className="font-bold text-[#111827] mt-0.5 block">{dayTypeLabel(leave)}</span>
      </div>
      <div className="pt-2 border-t border-[#DFE6F1]">
        <span className="text-[#7185A5] block">Start Date</span>
        <span className="font-semibold text-[#111827] mt-0.5 block">{formatDate(leave.startDate)}</span>
      </div>
      <div className="pt-2 border-t border-[#DFE6F1]">
        <span className="text-[#7185A5] block">End Date</span>
        <span className="font-semibold text-[#111827] mt-0.5 block">{formatDate(leave.endDate)}</span>
      </div>
      <div className="col-span-2 pt-2 border-t border-[#DFE6F1] flex items-center justify-between">
        <span className="text-[#7185A5]">Total Working Days:</span>
        <span className="font-mono font-bold text-[#5038F5]">{daysLabel(leave.totalDays)}</span>
      </div>
    </div>

    <div>
      <span className="font-semibold text-[#111827] block mb-1">Reason for Leave</span>
      <p className="p-3 rounded-lg bg-white border border-[#DFE6F1] text-[#475569] leading-relaxed whitespace-pre-wrap">{leave.reason}</p>
    </div>

    {leave.reviewedByName && (
      <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1] space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[#111827] flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-[#5038F5]" /> Reviewed by {leave.reviewedByName}
          </span>
          <span className="text-[#7185A5] text-[11px]">{leave.reviewedAt && formatDateIst(leave.reviewedAt)}</span>
        </div>
        {leave.reviewerComment && (
          <div>
            <span className="text-[#7185A5] block text-[11px]">Approval Comment:</span>
            <p className="text-[#047857] font-medium mt-0.5">"{leave.reviewerComment}"</p>
          </div>
        )}
        {leave.rejectionReason && (
          <div>
            <span className="text-[#7185A5] block text-[11px]">Rejection Reason:</span>
            <p className="text-[#E11D48] font-medium mt-0.5">"{leave.rejectionReason}"</p>
          </div>
        )}
      </div>
    )}
  </div>
);
