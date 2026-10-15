import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { leavesApi, LeaveListParams } from '../../api/leaves';
import { useApiData } from '../../api/useApiData';
import { ApiError, errorMessage } from '../../api/client';
import { LEAVE_STATUS_LABEL, LEAVE_STATUSES, LEAVE_TYPE_LABEL, LEAVE_TYPES, LeaveRequest, LeaveStatus, LeaveType } from '../../types/attendance';
import { DEPARTMENTS } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { FormField } from '../common/FormField';
import { Avatar } from '../common/Avatar';
import { LEAVE_STATUS_VARIANT, LeaveDetails, dayTypeLabel, daysLabel } from './LeaveDetails';
import { CalendarCheck, Check, CheckCircle2, Download, Eye, Search, X, XCircle } from 'lucide-react';
import { exportToCSV, formatDate } from '../../utils/formatters';

const PAGE_SIZE = 50;

export const LeaveManagementView: React.FC = () => {
  const { currentUser, showToast } = useApp();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [leaveType, setLeaveType] = useState<'' | LeaveType>('');
  const [status, setStatus] = useState<'' | LeaveStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setOffset(0), [debouncedSearch, department, leaveType, status, from, to]);

  const params: LeaveListParams = {
    search: debouncedSearch || undefined,
    department: department || undefined,
    leaveType: leaveType || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: PAGE_SIZE,
    offset,
  };
  const { data, error, isLoading, reload } = useApiData(() => leavesApi.list(params), [debouncedSearch, department, leaveType, status, from, to, offset]);

  const [toView, setToView] = useState<LeaveRequest | null>(null);
  const [toApprove, setToApprove] = useState<LeaveRequest | null>(null);
  const [toReject, setToReject] = useState<LeaveRequest | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cosmetic: the server refuses self-review anyway.
  const isSelf = (req: LeaveRequest) => Boolean(currentUser.employeeId) && req.employeeId === currentUser.employeeId;

  const openApprove = (req: LeaveRequest) => {
    setToApprove(req);
    setApprovalComment('');
    setReviewError('');
  };
  const openReject = (req: LeaveRequest) => {
    setToReject(req);
    setRejectionReason('');
    setReviewError('');
  };

  const submitReview = async (decision: 'approve' | 'reject') => {
    const req = decision === 'approve' ? toApprove : toReject;
    if (!req) return;
    if (decision === 'reject' && !rejectionReason.trim()) {
      setReviewError('A rejection reason is required.');
      return;
    }
    setIsSubmitting(true);
    setReviewError('');
    try {
      if (decision === 'approve') await leavesApi.approve(req.id, approvalComment.trim() || undefined);
      else await leavesApi.reject(req.id, rejectionReason.trim());
      showToast('success', `Leave for ${req.employeeName} ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      setToApprove(null);
      setToReject(null);
      reload();
    } catch (err) {
      setReviewError(err instanceof ApiError && err.details?.[0] ? err.details[0].message : errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Applied On', 'Status', 'Reason', 'Reviewed By', 'Reviewer Comment / Rejection Reason'];
    const rows = data.leaves.map(l => [
      l.employeeCode,
      l.employeeName,
      l.department,
      LEAVE_TYPE_LABEL[l.leaveType],
      l.startDate,
      l.endDate,
      l.totalDays,
      l.appliedAt.slice(0, 10),
      LEAVE_STATUS_LABEL[l.status],
      l.reason,
      l.reviewedByName ?? '',
      l.reviewerComment ?? l.rejectionReason ?? '',
    ]);
    exportToCSV(`company_leaves_${data.today}`, headers, rows);
  };

  const selectClass = 'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Leave Management & Approvals</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Review time-off requests. Nobody can approve their own leave.</p>
        </div>
        <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCSV} disabled={!data}>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Pending Requests</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]">{summary?.pending ?? '—'}</span>
            <span className="text-xs text-[#B45309] font-medium">needs review</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Approved Leaves</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">{summary?.approved ?? '—'}</span>
            <span className="text-xs text-[#047857] font-medium">authorized</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Rejected Requests</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#E11D48]">{summary?.rejected ?? '—'}</span>
            <span className="text-xs text-[#E11D48] font-medium">declined</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">On Leave Today</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">{summary?.onLeaveToday ?? '—'}</span>
            <span className="text-xs text-[#5038F5] font-medium">full day</span>
          </div>
        </Card>
      </div>

      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by employee name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
          <select value={department} onChange={e => setDepartment(e.target.value)} className={selectClass} aria-label="Department">
            <option value="">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={leaveType} onChange={e => setLeaveType(e.target.value as '' | LeaveType)} className={selectClass} aria-label="Leave type">
            <option value="">All Leave Categories</option>
            {LEAVE_TYPES.map(t => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as '' | LeaveStatus)} className={selectClass} aria-label="Status">
            <option value="">All Statuses</option>
            {LEAVE_STATUSES.map(s => (
              <option key={s} value={s}>
                {LEAVE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {/* Two dates side by side in their own cell; min-w-0 lets native date inputs shrink instead of overflowing. */}
          <div className="grid grid-cols-2 gap-1 sm:col-span-2 lg:col-span-2">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${selectClass} min-w-0`} aria-label="From date" title="From" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${selectClass} min-w-0`} aria-label="To date" title="To" />
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : isLoading && !data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading leave requests…</div>
        ) : data!.leaves.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="w-6 h-6" />} title="No leave applications found" description="No requests match your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-center">Total Days</th>
                  <th className="py-3 px-4">Applied On</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right min-w-[130px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {data!.leaves.map(req => (
                  <tr key={req.id} className="hover:bg-[#F7F9FC]/60 transition-colors" data-testid={`leave-row-${req.id}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={req.employeeName} url={req.employeeAvatarUrl} />
                        <div className="font-semibold text-[#111827]">
                          {req.employeeName}
                          <span className="font-mono text-[10px] text-[#7185A5] block">{req.employeeCode}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">{req.department}</td>
                    <td className="py-3 px-4 font-semibold text-[#111827]">
                      {LEAVE_TYPE_LABEL[req.leaveType]}
                      <span className="font-normal text-[10px] text-[#7185A5] block">{dayTypeLabel(req)}</span>
                    </td>
                    <td className="py-3 px-4 text-[#111827] whitespace-nowrap font-medium">
                      {formatDate(req.startDate)}
                      {req.endDate !== req.startDate && (
                        <span className="font-normal text-[10px] text-[#7185A5] block">to {formatDate(req.endDate)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-bold text-[#5038F5]">{daysLabel(req.totalDays)}</td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">{formatDate(req.appliedAt.slice(0, 10))}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge variant={LEAVE_STATUS_VARIANT[req.status]}>{LEAVE_STATUS_LABEL[req.status]}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setToView(req)} className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer" title="View full application">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {req.status === 'pending' && !isSelf(req) && (
                          <>
                            <button
                              onClick={() => openApprove(req)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#047857] bg-[#047857]/10 hover:bg-[#047857]/20 rounded transition-colors cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => openReject(req)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#E11D48] bg-[#E11D48]/10 hover:bg-[#E11D48]/20 rounded transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                        {req.status === 'pending' && isSelf(req) && <span className="text-[10px] text-[#7185A5] italic">Your own request</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {toView && (
        <Modal isOpen={true} onClose={() => setToView(null)} title="Leave Application Details" maxWidth="md">
          <LeaveDetails leave={toView} showEmployee />
          <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-[#DFE6F1]">
            {toView.status === 'pending' && !isSelf(toView) && (
              <>
                <Button variant="primary" size="sm" onClick={() => { const r = toView; setToView(null); openApprove(r); }}>
                  Approve Request
                </Button>
                <Button variant="danger" size="sm" onClick={() => { const r = toView; setToView(null); openReject(r); }}>
                  Reject Request
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setToView(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {toApprove && (
        <Modal isOpen={true} onClose={() => setToApprove(null)} title="Approve Leave Application" maxWidth="md">
          <div className="space-y-4 pt-1 text-xs">
            <div className="p-3.5 rounded-xl bg-[#047857]/10 border border-[#047857]/20 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#047857] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#047857]">Confirm Leave Approval</p>
                <p className="text-[#047857]/80 mt-0.5">
                  Authorize {daysLabel(toApprove.totalDays)} of {LEAVE_TYPE_LABEL[toApprove.leaveType]} for{' '}
                  <span className="font-semibold">{toApprove.employeeName}</span> ({formatDate(toApprove.startDate)} to {formatDate(toApprove.endDate)})?
                </p>
              </div>
            </div>
            {reviewError && <div className="p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48]" role="alert">{reviewError}</div>}
            <FormField label="Approval Comment (Optional)">
              <input
                type="text"
                placeholder="e.g. Approved, coverage confirmed with team lead..."
                value={approvalComment}
                onChange={e => setApprovalComment(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
            </FormField>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE6F1]">
              <Button variant="outline" size="sm" onClick={() => setToApprove(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => submitReview('approve')} disabled={isSubmitting}>
                {isSubmitting ? 'Approving...' : 'Confirm Approval'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toReject && (
        <Modal isOpen={true} onClose={() => setToReject(null)} title="Reject Leave Application" maxWidth="md">
          <form
            onSubmit={e => {
              e.preventDefault();
              submitReview('reject');
            }}
            className="space-y-4 pt-1 text-xs"
          >
            <div className="p-3.5 rounded-xl bg-[#E11D48]/10 border border-[#E11D48]/20 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#E11D48]">Decline Leave Request</p>
                <p className="text-[#E11D48]/80 mt-0.5">
                  Decline leave application for <span className="font-semibold">{toReject.employeeName}</span> ({formatDate(toReject.startDate)} to{' '}
                  {formatDate(toReject.endDate)}).
                </p>
              </div>
            </div>
            <FormField label="Rejection Reason" required error={reviewError}>
              <textarea
                rows={3}
                placeholder="Please state why this leave request is being declined..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="w-full text-xs p-3 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] resize-none"
              />
            </FormField>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE6F1]">
              <Button type="button" variant="outline" size="sm" onClick={() => setToReject(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={isSubmitting || !rejectionReason.trim()}>
                {isSubmitting ? 'Declining...' : 'Confirm Rejection'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
