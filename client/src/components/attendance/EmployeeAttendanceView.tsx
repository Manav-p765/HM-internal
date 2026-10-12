import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import {
  Clock,
  Calendar,
  Play,
  Square,
  CheckCircle2,
  Filter,
  Download,
} from 'lucide-react';
import { formatDate, formatMonthYear, exportToCSV } from '../../utils/formatters';

export const EmployeeAttendanceView: React.FC = () => {
  const {
    currentUser,
    attendance,
    todayAttendance,
    punchIn,
    punchOut,
    settings,
  } = useApp();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Filter personal records
  const myRecords = useMemo(() => {
    if (!currentUser.employeeId) return [];
    return attendance.filter(a => a.employeeId === currentUser.employeeId);
  }, [currentUser.employeeId, attendance]);

  // List of available months
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthStr);
    myRecords.forEach(r => set.add(r.date.substring(0, 7)));
    return Array.from(set).sort().reverse();
  }, [myRecords, currentMonthStr]);

  // Filter by selected month
  const monthFiltered = useMemo(() => {
    return myRecords.filter(r => r.date.startsWith(selectedMonth));
  }, [myRecords, selectedMonth]);

  // Stats
  const daysPresent = monthFiltered.filter(r => r.status === 'Present' || r.status === 'Working' || r.status === 'Late').length;
  const totalMinutes = monthFiltered.reduce((sum, r) => sum + r.durationMinutes, 0);
  const lateDays = monthFiltered.filter(r => r.status === 'Late').length;

  const handleExportCSV = () => {
    const headers = ['Date', 'Punch In', 'Punch Out', 'Duration (Hours)', 'Status', 'Notes'];
    const rows = monthFiltered.map(r => [
      r.date,
      new Date(r.punchIn).toLocaleTimeString(),
      r.punchOut ? new Date(r.punchOut).toLocaleTimeString() : 'In Progress',
      (r.durationMinutes / 60).toFixed(2),
      r.status,
      r.notes || '',
    ]);
    exportToCSV(`my_attendance_${selectedMonth}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            My Attendance History
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Verified shift logs, punch timestamps, and workday durations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>

          {!todayAttendance && (
            <Button
              variant="primary"
              size="sm"
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={punchIn}
            >
              Punch In
            </Button>
          )}

          {todayAttendance && !todayAttendance.punchOut && (
            <Button
              variant="danger"
              size="sm"
              icon={<Square className="w-3.5 h-3.5 fill-current" />}
              onClick={punchOut}
            >
              Punch Out
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Days Present ({formatMonthYear(selectedMonth)})
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">
              {daysPresent}
            </span>
            <span className="text-xs text-[#7185A5]">working days</span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Total Working Hours
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">
              {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
            </span>
            <span className="text-xs text-[#7185A5]">elapsed</span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">
            Late Arrivals
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl font-mono font-bold ${lateDays > 0 ? 'text-[#B45309]' : 'text-[#7185A5]'}`}>
              {lateDays}
            </span>
            <span className="text-xs text-[#7185A5]">past {settings.workStartTime || '09:30'}</span>
          </div>
        </Card>
      </div>

      {/* Month Filter Selector */}
      <Card padding="sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#5038F5]" />
          <span className="text-xs font-semibold text-[#111827]">Filter Month:</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {formatMonthYear(m)} ({m})
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Attendance History Table */}
      <Card padding="none" className="overflow-hidden">
        {monthFiltered.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-6 h-6" />}
            title="No records for this month"
            description={`You have no recorded attendance for ${formatMonthYear(selectedMonth)}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Punch In (UTC Server)</th>
                  <th className="py-3 px-4">Punch Out</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {monthFiltered.map(r => (
                  <tr key={r.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#111827]">
                      {formatDate(r.date)}
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-mono">
                      {new Date(r.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-mono">
                      {r.punchOut ? (
                        new Date(r.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      ) : (
                        <span className="text-[#047857] font-sans font-semibold">In Progress</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#111827]">
                      {r.durationMinutes ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m` : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          r.status === 'Present'
                            ? 'success'
                            : r.status === 'Working'
                            ? 'purple'
                            : r.status === 'Late'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#7185A5]">
                      {r.isManualCorrection ? `Corrected: ${r.correctionReason}` : r.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
