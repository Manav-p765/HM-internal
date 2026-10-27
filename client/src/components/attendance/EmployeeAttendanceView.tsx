import React, { useMemo, useState } from 'react';
import { attendanceApi } from '../../api/attendance';
import { useApiData } from '../../api/useApiData';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { Calendar, CheckCircle2, Clock, Download } from 'lucide-react';
import { PunchOutButton } from './PunchOutButton';
import { PunchInButton } from './PunchInButton';
import { PunchFlagBadges } from './PunchFlagBadges';
import { exportToCSV, formatDate, formatMinutes, formatMonthYear, formatTimeIst } from '../../utils/formatters';
import { AttendanceRecord } from '../../types/attendance';

// The 12 months up to and including `month` (YYYY-MM), newest first. Calendar arithmetic only.
function previousMonths(month: string, count = 12): string[] {
  let [year, m] = month.split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.push(`${year}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      year -= 1;
    }
  }
  return months;
}

function recordStatus(r: AttendanceRecord): { label: string; variant: 'success' | 'purple' | 'error' } {
  if (r.punchOut) return { label: 'Present', variant: 'success' };
  if (r.workedMinutes === null) return { label: 'Not closed', variant: 'error' };
  return { label: 'Working', variant: 'purple' };
}

export const EmployeeAttendanceView: React.FC = () => {
  // undefined = the current month as the server sees it (IST).
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const { data, error, isLoading, reload } = useApiData(() => attendanceApi.myMonth(selectedMonth), [selectedMonth]);
  const today = useApiData(() => attendanceApi.today(), []);

  const month = data?.month ?? selectedMonth ?? '';
  const months = useMemo(() => (data ? previousMonths(data.today.slice(0, 7)) : []), [data?.today]);
  const todayRecord = today.data?.record ?? null;

  const handleExportCSV = () => {
    if (!data) return;
    const headers = ['Date', 'Punch In (IST)', 'Punch Out (IST)', 'Worked', 'Status', 'Notes'];
    const rows = data.records.map(r => [
      r.workDate,
      formatTimeIst(r.punchIn),
      r.punchOut ? formatTimeIst(r.punchOut) : 'Open',
      formatMinutes(r.workedMinutes),
      recordStatus(r).label,
      r.note ?? '',
    ]);
    exportToCSV(`my_attendance_${month}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">My Attendance History</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Punch in when you start your shift and punch out when you stop. Times are shown in IST.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCSV} disabled={!data}>
            Export CSV
          </Button>
          {!todayRecord && today.data?.lastShift?.punchOut && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#047857]/10 text-[#047857] text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Last shift punched out {formatTimeIst(today.data.lastShift.punchOut)}
            </span>
          )}
          {today.data && !todayRecord && today.data.leave?.dayType !== 'full' && (
            <PunchInButton
              outsideWindow={!today.data.punchInDue}
              onPunchedIn={async () => {
                await Promise.all([today.reload(), reload()]);
              }}
            />
          )}
          {todayRecord && !todayRecord.punchOut && (
            <PunchOutButton
              onPunchedOut={async () => {
                await Promise.all([today.reload(), reload()]);
              }}
            />
          )}
          {todayRecord?.punchOut && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#047857]/10 text-[#047857] text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Punched out {formatTimeIst(todayRecord.punchOut)}
            </span>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Days Present ({month ? formatMonthYear(month) : '—'})</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">{data?.summary.daysPresent ?? '—'}</span>
            <span className="text-xs text-[#7185A5]">working days</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Total Working Hours</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">{data ? formatMinutes(data.summary.totalMinutes) : '—'}</span>
            <span className="text-xs text-[#7185A5]">from server punches</span>
          </div>
        </Card>
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Incomplete Days</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl font-mono font-bold ${data?.summary.incomplete ? 'text-[#E11D48]' : 'text-[#7185A5]'}`}>
              {data?.summary.incomplete ?? '—'}
            </span>
            <span className="text-xs text-[#7185A5]">never punched out</span>
          </div>
        </Card>
      </div>

      {/* Month selector */}
      <Card padding="sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#5038F5]" />
          <span className="text-xs font-semibold text-[#111827]">Filter Month:</span>
          <select
            value={month}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            {months.map(m => (
              <option key={m} value={m}>
                {formatMonthYear(m)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* History table */}
      <Card padding="none" className="overflow-hidden">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : isLoading && !data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading attendance…</div>
        ) : data!.records.length === 0 ? (
          <EmptyState icon={<Clock className="w-6 h-6" />} title="No records for this month" description={`You have no recorded attendance for ${formatMonthYear(month)}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Punch In (IST)</th>
                  <th className="py-3 px-4">Punch Out</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {data!.records.map(r => {
                  const status = recordStatus(r);
                  return (
                    <tr key={r.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#111827]">{formatDate(r.workDate)}</td>
                      <td className="py-3 px-4 text-[#475569] font-mono">
                        {formatTimeIst(r.punchIn)} <PunchFlagBadges record={r} />
                      </td>
                      <td className="py-3 px-4 text-[#475569] font-mono">{r.punchOut ? formatTimeIst(r.punchOut) : '—'}</td>
                      <td className="py-3 px-4 font-mono font-medium text-[#111827]">{formatMinutes(r.workedMinutes)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="py-3 px-4 text-[#7185A5]">{r.corrected ? `Corrected: ${r.note ?? ''}` : r.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
