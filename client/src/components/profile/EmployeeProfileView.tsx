import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import {
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';

export const EmployeeProfileView: React.FC = () => {
  const { currentUser, employees, attendance } = useApp();

  const employeeRecord = useMemo(() => {
    return employees.find(e => e.id === currentUser.employeeId) || null;
  }, [employees, currentUser.employeeId]);

  const totalShiftsLogged = useMemo(() => {
    if (!currentUser.employeeId) return 0;
    return attendance.filter(a => a.employeeId === currentUser.employeeId).length;
  }, [attendance, currentUser.employeeId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
          My Employee Profile
        </h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
          Verified company records, employment status, and authenticated profile
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card padding="lg" className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-[#5038F5]/10 border-2 border-[#5038F5]/20 flex items-center justify-center font-bold text-2xl text-[#5038F5] mb-4 shadow-xs">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              currentUser.name.charAt(0)
            )}
          </div>
          <h2 className="text-lg font-bold text-[#111827]">{currentUser.name}</h2>
          <p className="text-xs text-[#7185A5] mt-0.5">
            {employeeRecord?.designation || currentUser.designation}
          </p>

          <div className="flex items-center gap-2 mt-3">
            <Badge variant="purple" size="md">
              Role: Employee
            </Badge>
            <Badge variant="success" size="md">
              Active Member
            </Badge>
          </div>

          <div className="w-full mt-6 pt-4 border-t border-[#DFE6F1] space-y-2 text-left text-xs">
            <div className="flex justify-between text-[#7185A5]">
              <span>Employee ID:</span>
              <span className="font-mono font-bold text-[#111827]">
                {employeeRecord?.id || currentUser.employeeId || 'EMP-003'}
              </span>
            </div>
            <div className="flex justify-between text-[#7185A5]">
              <span>Department:</span>
              <span className="font-medium text-[#111827]">
                {employeeRecord?.department || 'Engineering'}
              </span>
            </div>
            <div className="flex justify-between text-[#7185A5]">
              <span>Joined:</span>
              <span className="font-medium text-[#111827]">
                {employeeRecord?.joiningDate ? formatDate(employeeRecord.joiningDate) : '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Details & Security Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-[#5038F5]" />
              Employment Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                <span className="text-[11px] text-[#7185A5] block">Official Work Email</span>
                <span className="font-medium text-[#111827] mt-0.5 block">
                  {currentUser.email}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                <span className="text-[11px] text-[#7185A5] block">Registered Contact Phone</span>
                <span className="font-medium text-[#111827] mt-0.5 block">
                  {employeeRecord?.phoneNumber || '+91 98765 43210'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                <span className="text-[11px] text-[#7185A5] block">Disbursement Mode</span>
                <span className="font-medium text-[#111827] mt-0.5 block">
                  {employeeRecord?.paymentMethod || 'Bank Transfer (NEFT/RTGS)'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                <span className="text-[11px] text-[#7185A5] block">Total Shifts Completed</span>
                <span className="font-mono font-bold text-[#047857] mt-0.5 block">
                  {totalShiftsLogged} working days
                </span>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#047857]" />
              Account Security & Access Privileges
            </h3>
            <p className="text-xs text-[#7185A5] mb-4">
              Your account is cryptographically linked to your registered employee profile at Hybrid Monks.
            </p>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#047857]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Authenticated via corporate credential session</span>
              </div>
              <div className="flex items-center gap-2 text-[#047857]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Scoped to Employee Workspace (Personal Dashboard, Attendance, and Salary Slips)</span>
              </div>
              <div className="flex items-center gap-2 text-[#7185A5]">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Protected against unauthorized company accounting and financial visibility</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
