import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { leavesApi } from '../../api/leaves';
import { useApiData } from '../../api/useApiData';
import { errorMessage } from '../../api/client';
import { LEAVE_STATUS_LABEL, LEAVE_STATUSES, LEAVE_TYPE_LABEL, LeaveRequest, LeaveStatus } from '../../types/attendance';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ApplyLeaveModal } from './ApplyLeaveModal';
import { LEAVE_STATUS_VARIANT, LeaveDetails, dayTypeLabel, daysLabel } from './LeaveDetails';
import { Calendar, Edit2, Eye, Filter, Plus, Trash2 } from 'lucide-react';
import { formatDate, formatDateIst } from '../../utils/formatters';

export const EmployeeLeaveView: React.FC = () => {
  const { showToast } = useApp();
  const { data, error, isLoading, reload } = useApiData(() => leavesApi.mine(), []);
  const leaves = data?.leaves ?? [];
  const currentYear = data ? Number(data.today.slice(0, 4)) : null;

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? currentYear;
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [leaveToEdit, setLeaveToEdit] = useState<LeaveRequest | null>(null);
  const [leaveToView, setLeaveToView] = useState<LeaveRequest | null>(null);
  const [leaveToCancel, setLeaveToCancel] = useState<LeaveRequest | null>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>(currentYear ? [currentYear] : []);
    leaves.forEach(l => years.add(Number(l.startDate.slice(0, 4))));
    return [...years].sort().reverse();
  }, [leaves, currentYear]);

  const yearLeaves = useMemo(() => leaves.filter(l => Number(l.startDate.slice(0, 4)) === year), [leaves, year]);
  const filtered = useMemo(() => yearLeaves.filter(l => statusFilter === 'all' || l.status === statusFilter), [yearLeaves, statusFilter]);
  const count = (status: LeaveStatus) => yearLeaves.filter(l => l.status === status).length;

  const openApply = (leave: LeaveRequest | null) => {
    setLeaveToEdit(leave);
    setIsApplyOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!leaveToCancel) return;
    try {
      await leavesApi.cancel(leaveToCancel.id);
      showToast('info', 'Leave request cancelled.');
      reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setLeaveToCancel(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">My Leaves</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Submit time-off requests and track their approval</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => openApply(null)} disabled={!data}>
          Apply for Leave
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Leave Requests ({year ?? '—'})</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#111827]">{yearLeaves.length}</span>
            <span className="text-xs text-[#7185A5]">total filed</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Approved</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">{count('approved')}</span>
            <span className="text-xs text-[#047857] font-medium">{data ? daysLabel(data.summary.approvedDaysThisYear) : ''} this year</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Pending</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]">{count('pending')}</span>
            <span className="text-xs text-[#B45309] font-medium">under review</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Rejected</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#E11D48]">{count('rejected')}</span>
            <span className="text-xs text-[#E11D48] font-medium">declined</span>
          </div>
        </Card>
      </div>

      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-[#5038F5]" />
            <span className="text-xs font-semibold text-[#111827]">Calendar Year:</span>
            <select
              value={year ?? ''}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="text-xs font-medium px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[#7185A5]" />
            <span className="text-xs font-semibold text-[#111827]">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | LeaveStatus)}
              className="text-xs font-medium px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Statuses</option>
              {LEAVE_STATUSES.map(s => (
                <option key={s} value={s}>
                  {LEAVE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : isLoading && !data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading leave requests…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-6 h-6" />}
            title="No leave requests found"
            description="You have not submitted any leave requests matching the selected filters."
            actionLabel="Apply for Leave"
            onAction={() => openApply(null)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Start Date</th>
                  <th className="py-3 px-4">End Date</th>
                  <th className="py-3 px-4 text-center">Total Days</th>
                  <th className="py-3 px-4">Applied On</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filtered.map(req => (
                  <tr key={req.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#111827]">
                      {LEAVE_TYPE_LABEL[req.leaveType]}
                      <span className="font-normal text-[11px] text-[#7185A5] block">{dayTypeLabel(req)}</span>
                    </td>
                    <td className="py-3 px-4 text-[#111827] whitespace-nowrap font-medium">{formatDate(req.startDate)}</td>
                    <td className="py-3 px-4 text-[#111827] whitespace-nowrap font-medium">{formatDate(req.endDate)}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-bold text-[#5038F5]">{daysLabel(req.totalDays)}</td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">{formatDateIst(req.appliedAt)}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge variant={LEAVE_STATUS_VARIANT[req.status]}>{LEAVE_STATUS_LABEL[req.status]}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setLeaveToView(req)} className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer" title="View request details">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {req.status === 'pending' && (
                          <>
                            <button onClick={() => openApply(req)} className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer" title="Edit pending request">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setLeaveToCancel(req)} className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer" title="Cancel pending request">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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

      {data && (
        <ApplyLeaveModal
          isOpen={isApplyOpen}
          onClose={() => {
            setIsApplyOpen(false);
            setLeaveToEdit(null);
          }}
          onSaved={() => reload()}
          today={data.today}
          myLeaves={leaves}
          leaveToEdit={leaveToEdit}
        />
      )}

      {leaveToView && (
        <Modal isOpen={true} onClose={() => setLeaveToView(null)} title="Leave Request Details" maxWidth="md">
          <LeaveDetails leave={leaveToView} />
          <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-[#DFE6F1]">
            {leaveToView.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const req = leaveToView;
                    setLeaveToView(null);
                    openApply(req);
                  }}
                >
                  Edit Request
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const req = leaveToView;
                    setLeaveToView(null);
                    setLeaveToCancel(req);
                  }}
                >
                  Cancel Request
                </Button>
              </>
            )}
            <Button variant="primary" size="sm" onClick={() => setLeaveToView(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!leaveToCancel}
        onClose={() => setLeaveToCancel(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel Leave Application"
        message={`Are you sure you want to cancel your pending ${leaveToCancel ? LEAVE_TYPE_LABEL[leaveToCancel.leaveType] : ''} request for ${formatDate(leaveToCancel?.startDate)} to ${formatDate(leaveToCancel?.endDate)}?`}
        confirmLabel="Yes, Cancel Leave"
        isDestructive={true}
      />
    </div>
  );
};
