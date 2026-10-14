import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  Clock,
  CalendarCheck,
  Receipt,
  UserCheck,
  ArrowRight,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { formatCurrency, formatDate, formatMonthYear } from '../../utils/formatters';

export const EmployeeDashboardView: React.FC = () => {
  const {
    currentUser,
    todayAttendance,
    punchIn,
    punchOut,
    attendance,
    mySalarySlips,
    settings,
  } = useApp();
  const navigate = useNavigate();

  // Live timer for currently working session
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (todayAttendance && !todayAttendance.punchOut) {
      const startTime = new Date(todayAttendance.punchIn).getTime();
      const updateElapsed = () => {
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
      };
      updateElapsed();
      interval = setInterval(updateElapsed, 1000);
    } else if (todayAttendance && todayAttendance.punchOut) {
      setElapsedSeconds(todayAttendance.durationMinutes * 60);
    } else {
      setElapsedSeconds(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [todayAttendance]);

  // Formatted live duration: HH:MM:SS
  const formatTimer = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Personal attendance history (my records)
  const myAttendanceRecords = useMemo(() => {
    if (!currentUser.employeeId) return [];
    return attendance.filter(a => a.employeeId === currentUser.employeeId);
  }, [currentUser.employeeId, attendance]);

  // Days present this month
  const currentMonthKey = new Date().toISOString().substring(0, 7);
  const daysPresentThisMonth = useMemo(() => {
    return myAttendanceRecords.filter(
      a => a.date.startsWith(currentMonthKey) && (a.status === 'Present' || a.status === 'Working' || a.status === 'Late')
    ).length;
  }, [myAttendanceRecords, currentMonthKey]);

  // Total hours worked this month
  const totalMinutesThisMonth = useMemo(() => {
    return myAttendanceRecords
      .filter(a => a.date.startsWith(currentMonthKey))
      .reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
  }, [myAttendanceRecords, currentMonthKey]);

  // Latest published salary slip
  const latestSalarySlip = mySalarySlips.length > 0 ? mySalarySlips[0] : null;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Hello, {currentUser.name} 👋
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            {currentUser.designation} · Hybrid Monks Employee Portal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="purple" size="md">
            Role: Employee
          </Badge>
          <span className="text-xs text-[#7185A5] font-mono">
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* TODAY'S ATTENDANCE PUNCH CARD (Dominant Visual Anchor) */}
      <Card padding="lg" className="border-[#5038F5]/20 bg-linear-to-r from-white via-white to-[#5038F5]/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7185A5]">
              Today's Attendance Station
            </span>
            <div className="flex items-center gap-3">
              <span className="text-3xl sm:text-4xl font-mono font-bold text-[#111827]">
                {formatTimer(elapsedSeconds)}
              </span>
              {todayAttendance && !todayAttendance.punchOut && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#047857] bg-[#047857]/10 px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-[#047857] animate-pulse" />
                  Currently Working
                </span>
              )}
              {todayAttendance && todayAttendance.punchOut && (
                <Badge variant="success" size="md">
                  Shift Completed
                </Badge>
              )}
              {!todayAttendance && (
                <Badge variant="neutral" size="md">
                  Not Punched In
                </Badge>
              )}
            </div>
            <p className="text-xs text-[#7185A5]">
              {todayAttendance
                ? `Punched in at ${new Date(todayAttendance.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : `Standard work hours start at ${settings.workStartTime || '09:30 AM'}`}
              {todayAttendance?.punchOut &&
                ` · Punched out at ${new Date(todayAttendance.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {!todayAttendance && (
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="w-4 h-4" />}
                onClick={punchIn}
                className="px-6 py-3 text-sm shadow-md"
              >
                Punch In Now
              </Button>
            )}

            {todayAttendance && !todayAttendance.punchOut && (
              <Button
                variant="danger"
                size="lg"
                icon={<Square className="w-4 h-4 fill-current" />}
                onClick={punchOut}
                className="px-6 py-3 text-sm shadow-md"
              >
                Punch Out
              </Button>
            )}

            {todayAttendance && todayAttendance.punchOut && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#047857]/10 text-[#047857] text-xs font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Attendance Logged for Today</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 4 PERSONAL SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Status */}
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Today's Shift</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-[#111827]">
              {todayAttendance
                ? todayAttendance.punchOut
                  ? 'Completed'
                  : 'In Progress'
                : 'Not Started'}
            </span>
            <Badge
              variant={
                todayAttendance
                  ? todayAttendance.punchOut
                    ? 'success'
                    : 'purple'
                  : 'neutral'
              }
            >
              {todayAttendance?.status || 'Pending'}
            </Badge>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            Expected: {settings.expectedDailyHours || 8} hrs/day
          </p>
        </Card>

        {/* Days Present This Month */}
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Days Present</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">
              {daysPresentThisMonth}
            </span>
            <span className="text-xs text-[#7185A5]">days logged</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            Month: {formatMonthYear(currentMonthKey)}
          </p>
        </Card>

        {/* Working Hours Logged */}
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Hours Logged</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">
              {Math.floor(totalMinutesThisMonth / 60)}h {totalMinutesThisMonth % 60}m
            </span>
            <span className="text-xs text-[#7185A5]">this month</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            Calculated from server punches
          </p>
        </Card>

        {/* Latest Published Salary Slip */}
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Latest Salary Slip</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-bold text-[#111827]">
              {latestSalarySlip ? formatMonthYear(latestSalarySlip.salaryMonth) : 'No Slips'}
            </span>
            {latestSalarySlip && (
              <Badge variant="success">
                {latestSalarySlip.paymentStatus}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">
            {latestSalarySlip ? (
              <button
                onClick={() => navigate('/salary/slips')}
                className="text-[#5038F5] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                View Slip <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              'Awaiting monthly slip publication'
            )}
          </p>
        </Card>
      </div>

      {/* RECENT PERSONAL ATTENDANCE RECORDS */}
      <Card padding="md">
        <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1]">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">
              Recent Personal Attendance Logs
            </h3>
            <p className="text-xs text-[#7185A5]">
              Your verified punch timestamps for recent working days
            </p>
          </div>
        </div>

        {myAttendanceRecords.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#7185A5]">
            No attendance records logged yet. Punch in above to start your day!
          </div>
        ) : (
          <div className="divide-y divide-[#DFE6F1] mt-1">
            {myAttendanceRecords.slice(0, 5).map(att => (
              <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[#111827] block">
                    {formatDate(att.date)}
                  </span>
                  <span className="text-[11px] text-[#7185A5]">
                    In: {new Date(att.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {att.punchOut && ` · Out: ${new Date(att.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[#111827]">
                    {att.durationMinutes ? `${Math.floor(att.durationMinutes / 60)}h ${att.durationMinutes % 60}m` : 'In progress'}
                  </span>
                  <Badge
                    variant={
                      att.status === 'Present'
                        ? 'success'
                        : att.status === 'Working'
                        ? 'purple'
                        : att.status === 'Late'
                        ? 'warning'
                        : 'neutral'
                    }
                  >
                    {att.status}
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
