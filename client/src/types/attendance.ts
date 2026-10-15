// Attendance, leave and availability types: these mirror the API JSON exactly.

// Today's availability (server/src/services/availability.ts is the only place the rules live).
export type Availability = 'on_leave' | 'online' | 'available' | 'not_in_today';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  online: 'Online',
  available: 'Available',
  on_leave: 'On leave',
  not_in_today: 'Not in today',
};

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  workDate: string; // YYYY-MM-DD (IST)
  punchIn: string; // ISO timestamp
  punchOut: string | null;
  source: 'login' | 'manual';
  note: string | null;
  corrected: boolean; // changed by an admin/manager
  workedMinutes: number | null; // null = an open record from an earlier day (incomplete)
}

export interface TodayLeave {
  id: string;
  leaveType: LeaveType;
  dayType: DayType;
  halfDayPeriod: HalfDayPeriod | null;
}

// GET /api/attendance/me/today
export interface MyAttendanceToday {
  date: string;
  serverTime: string;
  record: AttendanceRecord | null;
  leave: TodayLeave | null;
}

// GET /api/attendance/me?month=
export interface MyAttendanceMonth {
  month: string; // YYYY-MM
  today: string;
  records: AttendanceRecord[];
  summary: { daysPresent: number; totalMinutes: number; incomplete: number };
}

export type RosterStatus = 'present' | 'on_leave' | 'absent';

export const ROSTER_STATUS_LABEL: Record<RosterStatus, string> = {
  present: 'Present',
  on_leave: 'On Leave',
  absent: 'Absent',
};

export interface RosterEntry {
  employeeId: string;
  code: string;
  fullName: string;
  department: string;
  designation: string;
  avatarUrl: string | null;
  record: AttendanceRecord | null;
  leave: { leaveType: LeaveType; dayType: DayType; halfDayPeriod: HalfDayPeriod | null } | null;
  status: RosterStatus;
}

// GET /api/attendance?date= (admin, manager)
export interface AttendanceRoster {
  date: string;
  today: string;
  isWeekend: boolean;
  employees: RosterEntry[];
  summary: {
    total: number;
    present: number;
    absent: number;
    onApprovedLeave: number;
    halfDayLeave: number;
    currentlyWorking: number;
    incomplete: number;
  };
}

export interface CorrectionSnapshot {
  punchIn: string;
  punchOut: string | null;
  note: string | null;
}

export interface CorrectionEntry {
  id: string;
  createdAt: string;
  before: CorrectionSnapshot | null;
  after: CorrectionSnapshot;
  actorName: string;
  actorRole: string;
}

// GET /api/attendance/:employeeId/:date
export interface AttendanceDetail {
  employee: { id: string; fullName: string; code: string };
  date: string;
  record: AttendanceRecord | null;
  history: CorrectionEntry[];
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------
export type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid' | 'other';
export const LEAVE_TYPES: LeaveType[] = ['casual', 'sick', 'earned', 'unpaid', 'other'];
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  earned: 'Earned Leave',
  unpaid: 'Unpaid Leave',
  other: 'Other',
};

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export type DayType = 'full' | 'half';
export type HalfDayPeriod = 'first' | 'second';
export const HALF_DAY_LABEL: Record<HalfDayPeriod, string> = { first: 'First Half', second: 'Second Half' };

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  employeeAvatarUrl: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayType: DayType;
  halfDayPeriod: HalfDayPeriod | null;
  totalDays: number; // weekdays; a half day is 0.5
  reason: string; // only ever sent to the owner, admins and managers
  status: LeaveStatus;
  appliedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewerComment: string | null;
  rejectionReason: string | null;
}

export interface LeaveInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayType: DayType;
  halfDayPeriod?: HalfDayPeriod | null;
  reason: string;
}

// GET /api/leaves/me
export interface MyLeaves {
  today: string;
  leaves: LeaveRequest[];
  summary: { pending: number; approvedDaysThisYear: number; onLeaveToday: boolean; upcoming: LeaveRequest | null };
}

// GET /api/leaves (admin, manager)
export interface LeaveList {
  today: string;
  leaves: LeaveRequest[];
  total: number;
  limit: number;
  offset: number;
  summary: { pending: number; approved: number; rejected: number; cancelled: number; onLeaveToday: number };
}

// ---------------------------------------------------------------------------
// Client portal team (GET /api/portal/team): exactly these fields, nothing else about staff.
// ---------------------------------------------------------------------------
export interface PortalTeamMember {
  name: string;
  designation: string;
  avatarUrl: string | null;
  status: Availability | null; // null: an admin/manager, attendance not tracked (show no badge)
  projects: string[];
}
