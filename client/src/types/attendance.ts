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
  source: 'login' | 'manual' | 'punch'; // login = the old automatic punch-in; punch = the employee's button; manual = a correction
  note: string | null;
  corrected: boolean; // changed by an admin/manager
  workedMinutes: number | null; // null = an open record from an earlier day (incomplete)
  lateMinutes: number | null; // punched in more than 30 min after the shift start (derived from working hours)
  outsideHours: boolean; // punched in outside the shift window (allowed, flagged for review)
}

export interface TodayLeave {
  id: string;
  leaveType: LeaveType;
  dayType: DayType;
  halfDayPeriod: HalfDayPeriod | null;
}

// GET /api/attendance/me/today
export interface MyAttendanceToday {
  date: string; // the employee's working day (it follows their working hours)
  serverTime: string;
  shift: { start: string; end: string } | null; // working hours, IST; null when not set yet
  record: AttendanceRecord | null;
  leave: TodayLeave | null;
  punchInDue: boolean; // the shift window is open and nothing is recorded yet (not on full-day leave)
  punchOutDue: boolean; // the open shift has passed its end
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
  shift: { start: string; end: string } | null;
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
    late: number;
    outsideHours: number;
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

// GET /api/attendance/review?days= (admin, manager): records nobody has corrected that need a look.
export type ReviewReason = 'incomplete' | 'outside_hours' | 'late';
export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  incomplete: 'No punch-out',
  outside_hours: 'Outside hours',
  late: 'Late',
};
export interface ReviewRecord extends AttendanceRecord {
  fullName: string;
  code: string;
  reasons: ReviewReason[];
}
