import React from 'react';
import { useNavigate } from 'react-router';
import { TaskKpis } from '../work/TaskKpis';
import { useApp } from '../../context/AppContext';
import { attendanceApi } from '../../api/attendance';
import { leavesApi } from '../../api/leaves';
import { salaryApi } from '../../api/salary';
import { useApiData } from '../../api/useApiData';
import { LEAVE_TYPE_LABEL } from '../../types/attendance';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ArrowRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import { PunchOutButton } from '../attendance/PunchOutButton';
import { formatDate, formatMinutes, formatMonthYear, formatTimeIst } from '../../utils/formatters';
import { dayTypeLabel, daysLabel } from '../leaves/LeaveDetails';

export const EmployeeDashboardView: React.FC = () => {
  const { currentUser } = useApp();
  const navigate = useNavigate();

  // Everything time-related comes from the server: today's IST date, punch times, worked minutes.
  const today = useApiData(() => attendanceApi.today(), []);
  const month = useApiData(() => attendanceApi.myMonth(), []);
  const leaves = useApiData(() => leavesApi.mine(), []);
  // Own published payslips, newest first (only when the login is linked to an employee record).
  const slips = useApiData(() => (currentUser.employeeId ? salaryApi.mySlips() : Promise.resolve([])), [currentUser.employeeId]);

  const record = today.data?.record ?? null;
  const todayLeave = today.data?.leave ?? null;
  const latestSalarySlip = slips.data?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Hello, {currentUser.name} 👋</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">{currentUser.designation} · Hybrid Monks Employee Portal</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="purple" size="md">
            Role: Employee
          </Badge>
          {today.data && <span className="text-xs text-[#7185A5] font-mono">{formatDate(today.data.date)}</span>}
        </div>
      </div>

      {/* Today's punch card */}
      <Card padding="lg" className="border-[#5038F5]/20 bg-linear-to-r from-white via-white to-[#5038F5]/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6" data-testid="punch-card">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7185A5]">Today's Attendance</span>
            {today.error ? (
              <p className="text-xs text-[#E11D48]">{today.error}</p>
            ) : !today.data ? (
              <p className="text-xs text-[#7185A5]">Loading…</p>
            ) : record ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-mono font-bold text-[#111827]" data-testid="punch-in-time">
                    {formatTimeIst(record.punchIn)}
                  </span>
                  {record.punchOut ? (
                    <Badge variant="success" size="md">
                      Shift Completed
                    </Badge>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#047857] bg-[#047857]/10 px-2.5 py-1 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-[#047857] animate-pulse" />
                      Punched In
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#7185A5]">
                  Punched in automatically at sign-in{record.corrected ? ' (adjusted by a manager)' : ''}
                  {record.punchOut
                    ? ` · Punched out at ${formatTimeIst(record.punchOut)} · Worked ${formatMinutes(record.workedMinutes)}`
                    : ` · ${formatMinutes(record.workedMinutes)} so far (as of ${formatTimeIst(today.data.serverTime)} IST)`}
                </p>
              </>
            ) : (
              <>
                <span className="text-xl font-bold text-[#111827]">{todayLeave ? 'On leave today' : 'No punch-in yet'}</span>
                <p className="text-xs text-[#7185A5]">
                  {todayLeave
                    ? `${LEAVE_TYPE_LABEL[todayLeave.leaveType]} · ${dayTypeLabel(todayLeave)}`
                    : 'You are punched in automatically when you sign in.'}
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {record && !record.punchOut && (
              <PunchOutButton
                size="lg"
                className="px-6 py-3 text-sm shadow-md"
                onPunchedOut={async () => {
                  await Promise.all([today.reload(), month.reload()]);
                }}
              />
            )}
            {record?.punchOut && (
              <span
                className="flex items-center gap-2 p-3 rounded-lg bg-[#047857]/10 text-[#047857] text-xs font-semibold cursor-default"
                aria-disabled="true"
                data-testid="punched-out-chip"
              >
                <CheckCircle2 className="w-5 h-5" />
                Punched out at {formatTimeIst(record.punchOut)}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* My tasks (from the API) */}
      <TaskKpis title="My tasks" linkTo="/my/tasks" />

      {/* Personal summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Days Present</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">{month.data?.summary.daysPresent ?? '—'}</span>
            <span className="text-xs text-[#7185A5]">days logged</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Month: {month.data ? formatMonthYear(month.data.month) : '—'}</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Hours Logged</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">{month.data ? formatMinutes(month.data.summary.totalMinutes) : '—'}</span>
            <span className="text-xs text-[#7185A5]">this month</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Calculated from server punches</p>
        </Card>

        {/* Leave summary */}
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">My Leave</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#111827]">
              {leaves.data ? daysLabel(leaves.data.summary.approvedDaysThisYear) : '—'}
            </span>
            {leaves.data && leaves.data.summary.pending > 0 && <Badge variant="warning">{leaves.data.summary.pending} pending</Badge>}
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            {leaves.data?.summary.upcoming
              ? `Next: ${formatDate(leaves.data.summary.upcoming.startDate)} (${LEAVE_TYPE_LABEL[leaves.data.summary.upcoming.leaveType]})`
              : 'Approved this year'}
          </p>
          <button onClick={() => navigate('/my/leaves')} className="mt-1 text-[11px] text-[#5038F5] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
            <CalendarDays className="w-3 h-3" /> Apply or view leaves
          </button>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Latest Salary Slip</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-bold text-[#111827]">{latestSalarySlip ? formatMonthYear(latestSalarySlip.month) : 'No Slips'}</span>
            {latestSalarySlip && <Badge variant="success">Paid</Badge>}
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            {latestSalarySlip ? (
              <button onClick={() => navigate(`/salary/slips/${latestSalarySlip.id}`)} className="text-[#5038F5] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
                View Slip <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              'Awaiting monthly slip publication'
            )}
          </p>
        </Card>
      </div>

      {/* Recent attendance */}
      <Card padding="md">
        <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Recent Attendance</h3>
            <p className="text-xs text-[#7185A5]">Your punch times this month (IST)</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/my/attendance')}>
            View all
          </Button>
        </div>

        {month.error ? (
          <div className="py-6 text-center text-xs text-[#E11D48]">{month.error}</div>
        ) : !month.data ? (
          <div className="py-6 text-center text-xs text-[#7185A5]">Loading…</div>
        ) : month.data.records.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#7185A5]">No attendance records this month yet.</div>
        ) : (
          <div className="divide-y divide-[#DFE6F1] mt-1">
            {month.data.records.slice(0, 5).map(att => (
              <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[#111827] block">{formatDate(att.workDate)}</span>
                  <span className="text-[11px] text-[#7185A5]">
                    In: {formatTimeIst(att.punchIn)}
                    {att.punchOut && ` · Out: ${formatTimeIst(att.punchOut)}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[#111827]">{formatMinutes(att.workedMinutes)}</span>
                  <Badge variant={att.punchOut ? 'success' : att.workedMinutes === null ? 'error' : 'purple'}>
                    {att.punchOut ? 'Present' : att.workedMinutes === null ? 'Not closed' : 'Working'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
