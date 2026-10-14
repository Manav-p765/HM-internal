import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { employeesApi } from '../../api/employees';
import { useApiData } from '../../api/useApiData';
import { AttendanceRecord, Department } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import {
  Clock,
  Search,
  Filter,
  Download,
  Edit2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
} from 'lucide-react';
import { formatDate, exportToCSV } from '../../utils/formatters';

export const AdminAttendanceView: React.FC = () => {
  const {
    attendance,
    correctAttendance,
    currentUser,
    settings,
  } = useApp();

  // Deferred module: employees now come from the API, attendance records are still local.
  const roster = useApiData(() => employeesApi.list({ status: 'active', limit: 200 }), []);
  const employees = roster.data?.employees ?? [];

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [departmentFilter, setDepartmentFilter] = useState<'all' | Department>('all');
  const [search, setSearch] = useState('');

  // Manual correction modal state
  const [recordToCorrect, setRecordToCorrect] = useState<AttendanceRecord | null>(null);
  const [editPunchIn, setEditPunchIn] = useState('');
  const [editPunchOut, setEditPunchOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');

  // Active employees
  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.status === 'active');
  }, [employees]);

  // Today's stats
  const todayRecords = useMemo(() => {
    return attendance.filter(a => a.date === todayStr);
  }, [attendance, todayStr]);

  const currentlyWorkingCount = todayRecords.filter(r => !r.punchOut).length;
  const presentTodayCount = todayRecords.filter(r => r.punchOut || r.status === 'Working' || r.status === 'Late').length;
  const incompleteCount = todayRecords.filter(r => r.status === 'Incomplete').length;
  const notPunchedInCount = Math.max(0, activeEmployees.length - presentTodayCount);

  // Filtered records for the table
  const filteredRecords = useMemo(() => {
    return attendance.filter(r => {
      if (selectedDate && r.date !== selectedDate) return false;
      if (departmentFilter !== 'all' && r.department !== departmentFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = r.employeeName.toLowerCase().includes(q);
        const matchesDept = r.department.toLowerCase().includes(q);
        const matchesId = r.employeeId.toLowerCase().includes(q);
        if (!matchesName && !matchesDept && !matchesId) return false;
      }
      return true;
    });
  }, [attendance, selectedDate, departmentFilter, search]);

  const handleOpenCorrect = (record: AttendanceRecord) => {
    setRecordToCorrect(record);
    // Convert ISO to local time string for input
    setEditPunchIn(record.punchIn ? record.punchIn.substring(0, 19) : '');
    setEditPunchOut(record.punchOut ? record.punchOut.substring(0, 19) : '');
    setCorrectionReason('');
    setCorrectionError('');
  };

  const handleSaveCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordToCorrect) return;
    if (!correctionReason.trim()) {
      setCorrectionError('A mandatory reason is required for manual attendance corrections.');
      return;
    }

    const res = correctAttendance(
      recordToCorrect.id,
      new Date(editPunchIn).toISOString(),
      editPunchOut ? new Date(editPunchOut).toISOString() : undefined,
      correctionReason.trim()
    );

    if (res.success) {
      setRecordToCorrect(null);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Employee ID',
      'Employee Name',
      'Department',
      'Date',
      'Punch In (UTC)',
      'Punch Out (UTC)',
      'Duration (Hours)',
      'Status',
      'Is Corrected',
      'Correction Reason',
      'Corrected By',
    ];

    const rows = filteredRecords.map(r => [
      r.employeeId,
      r.employeeName,
      r.department,
      r.date,
      r.punchIn,
      r.punchOut || 'In Progress',
      (r.durationMinutes / 60).toFixed(2),
      r.status,
      r.isManualCorrection ? 'Yes' : 'No',
      r.correctionReason || '',
      r.correctedBy || '',
    ]);

    exportToCSV(`company_attendance_${selectedDate || 'all'}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Attendance Management
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Real-time employee punch tracking, punctuality auditing, and shift logs
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
        </div>
      </div>

      {/* KPI Cards (Today's Live Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Present Today</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">
              {presentTodayCount}
            </span>
            <span className="text-xs text-[#7185A5]">of {activeEmployees.length} staff</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Logged punches today</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Currently Working</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#5038F5]">
              {currentlyWorkingCount}
            </span>
            <span className="text-xs text-[#5038F5] font-medium">active shifts</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Punched in & not clocked out</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Not Punched In</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]">
              {notPunchedInCount}
            </span>
            <span className="text-xs text-[#B45309]">pending</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Expected work start: {settings.workStartTime || '09:30'}</p>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Incomplete Shifts</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#E11D48]">
              {incompleteCount}
            </span>
            <span className="text-xs text-[#E11D48]">anomalies</span>
          </div>
          <p className="text-[11px] text-[#7185A5] mt-1">Unclosed punch records</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee name, department, or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Marketing">Marketing</option>
              <option value="Operations">Operations</option>
              <option value="Finance">Finance</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {filteredRecords.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-6 h-6" />}
            title="No attendance records found"
            description={`No attendance punches recorded for ${formatDate(selectedDate)} matching your filters.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Punch In</th>
                  <th className="py-3 px-4">Punch Out</th>
                  <th className="py-3 px-4">Total Duration</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {currentUser.role === 'admin' && (
                    <th className="py-3 px-4 text-right w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredRecords.map(r => (
                  <tr key={r.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#111827]">
                      {r.employeeName}
                      <span className="font-mono text-[10px] text-[#7185A5] block">
                        {r.employeeId}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">
                      {r.department}
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#475569] whitespace-nowrap">
                      {new Date(r.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#475569] whitespace-nowrap">
                      {r.punchOut ? (
                        new Date(r.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      ) : (
                        <span className="text-[#047857] font-semibold">Working</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#111827] whitespace-nowrap">
                      {r.durationMinutes ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m` : 'In progress'}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
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
                      {r.isManualCorrection && (
                        <span className="block text-[9px] text-[#B45309] mt-0.5" title={r.correctionReason}>
                          (Adjusted)
                        </span>
                      )}
                    </td>
                    {currentUser.role === 'admin' && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenCorrect(r)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          title="Correct Attendance Record"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manual Correction Modal */}
      <Modal
        isOpen={!!recordToCorrect}
        onClose={() => setRecordToCorrect(null)}
        title="Correct Attendance Record"
        description={`Employee: ${recordToCorrect?.employeeName} · Date: ${formatDate(recordToCorrect?.date)}`}
        maxWidth="md"
      >
        {recordToCorrect && (
          <form onSubmit={handleSaveCorrection} className="space-y-4">
            {correctionError && (
              <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
                {correctionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Punch In Timestamp *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editPunchIn}
                  onChange={e => setEditPunchIn(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Punch Out Timestamp
                </label>
                <input
                  type="datetime-local"
                  value={editPunchOut}
                  onChange={e => setEditPunchOut(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Mandatory Reason for Adjustment *
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Employee forgot to punch out due to client emergency; verified via Slack logs"
                value={correctionReason}
                onChange={e => setCorrectionReason(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
              <span className="text-[10px] text-[#7185A5] mt-1 block">
                This correction will be recorded in the audit trail with your name ({currentUser.name}) and current timestamp.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
              <Button type="button" variant="outline" size="md" onClick={() => setRecordToCorrect(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Apply Correction
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
