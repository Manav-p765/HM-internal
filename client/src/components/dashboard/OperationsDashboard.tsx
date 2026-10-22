import React from 'react';
import { useNavigate } from 'react-router';
import { TaskKpis } from '../work/TaskKpis';
import { employeesApi } from '../../api/employees';
import { attendanceApi } from '../../api/attendance';
import { leavesApi } from '../../api/leaves';
import { useApiData } from '../../api/useApiData';
import { DEPARTMENTS } from '../../types';
import { LEAVE_TYPE_LABEL } from '../../types/attendance';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, Clock, UserCheck, Users } from 'lucide-react';
import { formatMinutes, formatTimeIst } from '../../utils/formatters';

// The operational dashboard: tasks, leave, today's attendance and headcount. No money anywhere: it is the
// whole dashboard for managers and the "Operations" tab for admins (one component for both). It calls only
// tasks, employees, attendance and leave APIs.
// "Today" is the working day from the server (06:00-05:59 IST). Admins and managers have no automatic
// punch-in, so they are never counted here (the roster leaves them out) and never shown as "not punched in".

const Kpi: React.FC<{
  label: string;
  icon: React.ReactNode;
  tone: string;
  value: React.ReactNode;
  note: React.ReactNode;
  testId?: string;
}> = ({ label, icon, tone, value, note, testId }) => (
  <Card padding="md" className="relative overflow-hidden">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-[#7185A5]">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>{icon}</div>
    </div>
    <div className="mt-2">
      <span className="text-2xl font-mono font-bold text-[#111827]" data-testid={testId}>
        {value}
      </span>
      <p className="text-[11px] text-[#7185A5] mt-1">{note}</p>
    </div>
  </Card>
);

export const OperationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const roster = useApiData(() => employeesApi.list({ limit: 200 }), []);
  const attendanceToday = useApiData(() => attendanceApi.roster(), []);
  const pendingLeaves = useApiData(() => leavesApi.list({ status: 'pending', limit: 5 }), []);

  const employees = roster.data?.employees ?? [];
  const summary = attendanceToday.data?.summary;
  const onLeaveToday = attendanceToday.data?.employees.filter(e => e.status === 'on_leave') ?? [];
  const clockIns = (attendanceToday.data?.employees ?? []).filter(e => e.record);
  const present = summary?.present ?? 0;
  // People on approved full-day leave are not expected in.
  const expected = Math.max(0, (summary?.total ?? 0) - onLeaveToday.length);
  const attendanceRate = summary ? `${Math.round((present / Math.max(1, expected)) * 100)}%` : '—';
  const loaded = (value: number | undefined) => (value === undefined ? '—' : value);

  return (
    <div className="space-y-6" data-testid="operations-dashboard">
      <TaskKpis title="Tasks across all projects" linkTo="/tasks" />

      {pendingLeaves.data && pendingLeaves.data.summary.pending > 0 && (
        <Card padding="sm" className="bg-[#B45309]/5 border-[#B45309]/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid="pending-leaves-banner">
            <div className="flex items-center gap-2 text-xs text-[#111827]">
              <CalendarDays className="w-4 h-4 text-[#B45309] shrink-0" />
              <span>
                <span className="font-semibold">
                  {pendingLeaves.data.summary.pending} leave request{pendingLeaves.data.summary.pending === 1 ? '' : 's'}
                </span>{' '}
                waiting for review: {pendingLeaves.data.leaves.map(l => l.employeeName).slice(0, 3).join(', ')}
              </span>
            </div>
            <button onClick={() => navigate('/leaves')} className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer self-start sm:self-auto">
              Review leaves &rarr;
            </button>
          </div>
        </Card>
      )}

      <Card padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="on-leave-card">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#7185A5] block">On Approved Leave Today</span>
              <span className="text-2xl font-mono font-bold text-[#5038F5]">{attendanceToday.data ? onLeaveToday.length : '—'}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {onLeaveToday.map(e => (
              <span key={e.employeeId} className="text-[11px] px-2 py-1 rounded-md bg-white border border-[#DFE6F1] font-medium text-[#111827]">
                {e.fullName}
                {e.leave && <span className="text-[#7185A5]"> · {LEAVE_TYPE_LABEL[e.leave.leaveType]}</span>}
              </span>
            ))}
            {attendanceToday.data && onLeaveToday.length === 0 && <span className="text-xs text-[#7185A5]">Nobody is on leave today.</span>}
            <button onClick={() => navigate('/attendance')} className="text-[11px] font-semibold text-[#5038F5] hover:underline cursor-pointer ml-2">
              Attendance &rarr;
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Team Present Today"
          icon={<UserCheck className="w-4 h-4" />}
          tone="bg-[#047857]/10 text-[#047857]"
          testId="kpi-present"
          value={
            <>
              {loaded(summary?.present)} <span className="text-base text-[#7185A5] font-normal">/ {summary ? expected : '—'}</span>
            </>
          }
          note="Punched in for today's working day"
        />
        <Kpi
          label="Currently Working"
          icon={<Clock className="w-4 h-4" />}
          tone="bg-[#5038F5]/10 text-[#5038F5]"
          testId="kpi-working"
          value={loaded(summary?.currentlyWorking)}
          note="On an open shift right now"
        />
        <Kpi
          label="Team Headcount"
          icon={<Users className="w-4 h-4" />}
          tone="bg-[#5038F5]/10 text-[#5038F5]"
          testId="kpi-headcount"
          value={loaded(roster.data?.summary.total)}
          note={`${roster.data?.summary.active ?? '—'} active on the roster`}
        />
        <Kpi
          label="Shift Attendance Rate"
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="bg-[#047857]/10 text-[#047857]"
          testId="kpi-attendance-rate"
          value={attendanceRate}
          note="Present out of those expected today"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Today's Team Clock-ins</h3>
              <p className="text-xs text-[#7185A5]">Employees only: admins and managers are not tracked</p>
            </div>
            <button onClick={() => navigate('/attendance')} className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer">
              Open attendance &rarr;
            </button>
          </div>
          <div className="divide-y divide-[#DFE6F1] mt-1">
            {!attendanceToday.data ? (
              <p className="py-8 text-center text-xs text-[#7185A5]">{attendanceToday.error ? 'Attendance could not be loaded.' : 'Loading…'}</p>
            ) : clockIns.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#7185A5]">No team members clocked in yet today.</p>
            ) : (
              clockIns.slice(0, 6).map(entry => (
                <div key={entry.employeeId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111827] truncate">{entry.fullName}</div>
                    <div className="text-[11px] text-[#7185A5] mt-0.5 flex items-center gap-1.5">
                      <span>{entry.department}</span>
                      <span>·</span>
                      <span>In: {formatTimeIst(entry.record!.punchIn)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={entry.record!.punchOut ? 'success' : 'purple'} size="sm">
                      {entry.record!.punchOut ? 'Punched out' : 'Working'}
                    </Badge>
                    <div className="text-[10px] text-[#7185A5] mt-0.5">{formatMinutes(entry.record!.workedMinutes)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Team Distribution</h3>
              <p className="text-xs text-[#7185A5]">Department breakdown & headcount</p>
            </div>
            <button
              onClick={() => navigate('/employees')}
              className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Manage Team <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {DEPARTMENTS.map(dept => (
              <div key={dept} className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] flex flex-col justify-between">
                <span className="text-xs text-[#7185A5] font-medium">{dept}</span>
                <div className="text-lg font-mono font-bold text-[#111827] mt-2">
                  {employees.filter(e => e.department === dept && e.status !== 'inactive').length}{' '}
                  <span className="text-[11px] font-normal text-[#7185A5]">members</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
