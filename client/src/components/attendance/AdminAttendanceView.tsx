import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { attendanceApi } from '../../api/attendance';
import { useApiData } from '../../api/useApiData';
import { ApiError, errorMessage } from '../../api/client';
import {
  HALF_DAY_LABEL,
  LEAVE_TYPE_LABEL,
  ROSTER_STATUS_LABEL,
  RosterEntry,
  RosterStatus,
} from '../../types/attendance';
import { DEPARTMENTS } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { FormField } from '../common/FormField';
import { Avatar } from '../common/Avatar';
import { CalendarCheck, Clock, Download, Edit2, History, Info, Search } from 'lucide-react';
import { exportToCSV, formatDate, formatMinutes, formatTimeIst, timeInputIst } from '../../utils/formatters';

const STATUS_VARIANT: Record<RosterStatus, 'success' | 'purple' | 'neutral'> = {
  present: 'success',
  on_leave: 'purple',
  absent: 'neutral',
};

export const AdminAttendanceView: React.FC = () => {
  const { currentUser } = useApp();
  // undefined = "today" as the server sees it (IST); the browser clock is never used.
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toCorrect, setToCorrect] = useState<RosterEntry | null>(null);

  const { data, error, isLoading, reload } = useApiData(() => attendanceApi.roster(selectedDate), [selectedDate]);
  const date = data?.date ?? selectedDate ?? '';

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.employees.filter(e => {
      if (departmentFilter !== 'all' && e.department !== departmentFilter) return false;
      if (q && ![e.fullName, e.department, e.code].some(v => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, departmentFilter, search]);

  const onLeave = useMemo(() => (data ? data.employees.filter(e => e.leave) : []), [data]);

  const handleExportCSV = () => {
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Date', 'Status', 'Punch In (IST)', 'Punch Out (IST)', 'Worked', 'Corrected', 'Note'];
    const rows = filtered.map(e => [
      e.code,
      e.fullName,
      e.department,
      date,
      ROSTER_STATUS_LABEL[e.status],
      e.record ? formatTimeIst(e.record.punchIn) : '',
      e.record?.punchOut ? formatTimeIst(e.record.punchOut) : e.record ? 'Open' : '',
      e.record ? formatMinutes(e.record.workedMinutes) : '',
      e.record?.corrected ? 'Yes' : 'No',
      e.record?.note ?? '',
    ]);
    exportToCSV(`company_attendance_${date}`, headers, rows);
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Attendance Management</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Daily punch records for the whole team. Employees are punched in automatically when they sign in.
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCSV} disabled={!data}>
          Export CSV
        </Button>
      </div>

      {/* KPI cards for the selected date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Present</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]" data-testid="kpi-present">{summary?.present ?? '—'}</span>
            <span className="text-xs text-[#7185A5]">of {summary?.total ?? '—'} staff</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Punched in on {formatDate(date)}</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Currently Working</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">{summary?.currentlyWorking ?? '—'}</span>
            <span className="text-xs text-[#5038F5] font-medium">not punched out</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">{data && data.date !== data.today ? 'Only shown for today' : 'Open records today'}</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">On Approved Leave</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]" data-testid="kpi-on-leave">{summary?.onApprovedLeave ?? '—'}</span>
            <span className="text-xs text-[#5038F5] font-medium">full day</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            Not marked absent{summary?.halfDayLeave ? ` · ${summary.halfDayLeave} on half day` : ''}
          </p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Absent</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]" data-testid="kpi-absent">{summary?.absent ?? '—'}</span>
            <span className="text-xs text-[#B45309]">no punch</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">No record and no approved leave</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Incomplete Shifts</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#E11D48]">{summary?.incomplete ?? '—'}</span>
            <span className="text-xs text-[#E11D48]">never closed</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Open records from earlier days</p>
        </Card>
      </div>

      {data?.isWeekend && (
        <Card padding="sm" className="bg-[#F7F9FC]">
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <Info className="w-4 h-4 text-[#7185A5] shrink-0" />
            {formatDate(date)} is a weekend: nobody is expected in, so "absent" counts are not meaningful.
          </div>
        </Card>
      )}

      {/* Approved leave on the selected date */}
      {onLeave.length > 0 && (
        <Card padding="sm" className="bg-[#5038F5]/5 border-[#5038F5]/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#5038F5] shrink-0" />
              <span className="text-xs font-semibold text-[#111827]">Approved Leave on {formatDate(date)}:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onLeave.map(e => (
                <span
                  key={e.employeeId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white border border-[#DFE6F1] font-medium text-[#111827]"
                >
                  <span className="font-semibold">{e.fullName}</span>
                  <Badge variant="purple" size="sm">
                    {LEAVE_TYPE_LABEL[e.leave!.leaveType]} (
                    {e.leave!.dayType === 'half' && e.leave!.halfDayPeriod ? HALF_DAY_LABEL[e.leave!.halfDayPeriod] : 'Full Day'})
                  </Badge>
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Filter bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee name, department, or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Attendance date"
            value={date}
            max={data?.today}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </div>
      </Card>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : isLoading && !data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading attendance…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-6 h-6" />}
            title="No employees found"
            description={`Nobody matches your filters for ${formatDate(date)}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Punch In</th>
                  <th className="py-3 px-4">Punch Out</th>
                  <th className="py-3 px-4">Worked</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filtered.map(e => (
                  <tr key={e.employeeId} className="hover:bg-[#F7F9FC]/60 transition-colors" data-testid={`attendance-row-${e.code}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={e.fullName} url={e.avatarUrl} />
                        <div>
                          <span className="font-semibold text-[#111827] block">{e.fullName}</span>
                          <span className="font-mono text-[10px] text-[#7185A5]">{e.code}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">{e.department}</td>
                    <td className="py-3 px-4 font-mono text-[#475569] whitespace-nowrap">{e.record ? formatTimeIst(e.record.punchIn) : '—'}</td>
                    <td className="py-3 px-4 font-mono text-[#475569] whitespace-nowrap">
                      {!e.record ? (
                        '—'
                      ) : e.record.punchOut ? (
                        formatTimeIst(e.record.punchOut)
                      ) : e.record.workedMinutes === null ? (
                        <span className="text-[#E11D48] font-sans font-semibold">Not closed</span>
                      ) : (
                        <span className="text-[#047857] font-sans font-semibold">Working</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#111827] whitespace-nowrap">
                      {e.record ? formatMinutes(e.record.workedMinutes) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge variant={STATUS_VARIANT[e.status]}>{ROSTER_STATUS_LABEL[e.status]}</Badge>
                      {e.leave?.dayType === 'half' && <span className="block text-[9px] text-[#5038F5] mt-0.5">Half-day leave</span>}
                      {e.record?.corrected && (
                        <span className="block text-[9px] text-[#B45309] mt-0.5" title={e.record.note ?? undefined}>
                          (Adjusted)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {/* Cosmetic: the server refuses corrections to your own record. */}
                      {e.employeeId !== currentUser.employeeId && (
                      <button
                        onClick={() => setToCorrect(e)}
                        className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                        title={e.record ? 'Correct attendance record' : 'Add attendance record'}
                        aria-label={`Correct attendance for ${e.fullName}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toCorrect && (
        <CorrectionModal
          entry={toCorrect}
          date={date}
          onClose={() => setToCorrect(null)}
          onSaved={() => {
            reload();
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Manual correction: IST times for the selected date, a mandatory reason, and the audit history.
// ---------------------------------------------------------------------------
const CorrectionModal: React.FC<{ entry: RosterEntry; date: string; onClose: () => void; onSaved: () => void }> = ({
  entry,
  date,
  onClose,
  onSaved,
}) => {
  const { currentUser, showToast } = useApp();
  const detail = useApiData(() => attendanceApi.detail(entry.employeeId, date), [entry.employeeId, date]);
  const [punchIn, setPunchIn] = useState(timeInputIst(entry.record?.punchIn) || '09:30');
  const [punchOut, setPunchOut] = useState(timeInputIst(entry.record?.punchOut));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (!note.trim()) {
      setErrors({ note: 'A reason for the correction is required' });
      return;
    }
    setIsSaving(true);
    try {
      const result = await attendanceApi.correct(entry.employeeId, date, {
        punchIn: `${date}T${punchIn}:00+05:30`,
        punchOut: punchOut ? `${date}T${punchOut}:00+05:30` : null,
        note: note.trim(),
      });
      detail.setData(current => (current ? { ...current, record: result.record, history: result.history } : current!));
      setNote('');
      showToast('success', `Attendance for ${entry.fullName} corrected and recorded in the audit log.`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(err.details.map(d => [d.path, d.message])));
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={entry.record ? 'Correct Attendance Record' : 'Add Attendance Record'}
      description={`Employee: ${entry.fullName} · Date: ${formatDate(date)} · Times in IST`}
      maxWidth="md"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {formError && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">{formError}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Punch In (IST)" required error={errors.punchIn}>
            <input type="time" required value={punchIn} onChange={e => setPunchIn(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Punch Out (IST)" error={errors.punchOut} hint="Leave empty if still working">
            <input type="time" value={punchOut} onChange={e => setPunchOut(e.target.value)} className={inputClass} />
          </FormField>
        </div>

        <FormField label="Reason for Adjustment" required error={errors.note}>
          <textarea
            rows={3}
            placeholder="e.g. Employee forgot to punch out; verified with the team lead"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </FormField>
        <p className="text-[10px] text-[#7185A5] -mt-2">
          The correction is recorded in the audit log with your name ({currentUser.name}) and the previous values.
        </p>

        {/* Audit history */}
        <div className="rounded-lg border border-[#DFE6F1] bg-[#F7F9FC] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827] mb-2">
            <History className="w-3.5 h-3.5 text-[#5038F5]" /> Correction history
          </div>
          {detail.error ? (
            <p className="text-[11px] text-[#E11D48]">{detail.error}</p>
          ) : detail.isLoading && !detail.data ? (
            <p className="text-[11px] text-[#7185A5]">Loading…</p>
          ) : detail.data!.history.length === 0 ? (
            <p className="text-[11px] text-[#7185A5]">No corrections yet.</p>
          ) : (
            <ul className="space-y-2" data-testid="correction-history">
              {detail.data!.history.map(h => (
                <li key={h.id} className="text-[11px] text-[#475569]">
                  <span className="font-semibold text-[#111827]">{h.actorName}</span> ·{' '}
                  {new Date(h.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                  <div className="font-mono">
                    {h.before ? `${formatTimeIst(h.before.punchIn)}–${formatTimeIst(h.before.punchOut)}` : 'no record'} →{' '}
                    {formatTimeIst(h.after.punchIn)}–{formatTimeIst(h.after.punchOut)}
                  </div>
                  {h.after.note && <div className="italic">“{h.after.note}”</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Apply Correction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
