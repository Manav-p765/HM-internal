import { api } from './client';
import { toQuery } from './query';
import {
  AttendanceDetail,
  AttendanceRecord,
  AttendanceRoster,
  CorrectionEntry,
  MyAttendanceMonth,
  MyAttendanceToday,
} from '../types/attendance';

// Punch-in is automatic (the server does it at sign-in); employees can only punch out.
// Times are ISO timestamps from the server clock; "today" is the server's IST date.
export interface AttendanceCorrection {
  punchIn: string; // ISO with offset, e.g. 2026-10-14T09:30:00+05:30
  punchOut: string | null;
  note: string;
}

export const attendanceApi = {
  today: () => api<MyAttendanceToday>('/attendance/me/today'),
  myMonth: (month?: string) => api<MyAttendanceMonth>(`/attendance/me${toQuery({ month })}`),
  punchOut: () => api<{ record: AttendanceRecord }>('/attendance/me/punch-out', { method: 'POST', body: {} }).then(r => r.record),

  // Admin, manager
  roster: (date?: string) => api<AttendanceRoster>(`/attendance${toQuery({ date })}`),
  detail: (employeeId: string, date: string) => api<AttendanceDetail>(`/attendance/${employeeId}/${date}`),
  correct: (employeeId: string, date: string, input: AttendanceCorrection) =>
    api<{ record: AttendanceRecord; history: CorrectionEntry[] }>(`/attendance/${employeeId}/${date}`, { method: 'PUT', body: input }),
};
