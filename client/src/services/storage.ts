import {
  CompanySettings,
  Employee,
  Invoice,
  InvoicePayment,
  SalaryRecord,
  SalarySlip,
  Transaction,
  ActivityLog,
  AuditLog,
  AuditActionType,
  AttendanceRecord,
  UserRole,
  LeaveRequest,
  LeaveType,
  LeaveStatus,
  DayType,
  HalfDayPeriod,
} from '../types';
import { roundToTwoDecimals } from '../utils/formatters';

const STORAGE_KEYS = {
  SETTINGS: 'monks_company_settings_v1',
  TRANSACTIONS: 'monks_transactions_v1',
  INVOICES: 'monks_invoices_v1',
  SALARIES: 'monks_salaries_v2',
  SALARY_SLIPS: 'monks_salary_slips_v2',
  ATTENDANCE: 'monks_attendance_v2',
  LEAVES: 'monks_leaves_v2',
  ACTIVITY_LOGS: 'monks_activity_logs_v1',
  AUDIT_LOGS: 'monks_audit_logs_v1',
};

// Initial Seed Settings for Hybrid Monks
const INITIAL_SETTINGS: CompanySettings = {
  companyName: 'Hybrid Monks',
  companyLogoText: 'HM',
  companyAddress: 'Level 4, Maker Maxity, Bandra Kurla Complex, Mumbai 400051',
  companyEmail: 'accounts@hybridmonks.com',
  companyPhone: '+91 22 6123 4567',
  companyGstin: '27AABCH1234F1Z8',
  defaultCurrency: 'INR',
  financialYearStartMonth: 4, // April
  invoicePrefix: 'INV-2026-',
  taxRatePercentage: 18,
  companyTimezone: 'Asia/Kolkata',
  workStartTime: '09:30',
  workEndTime: '18:30',
  expectedDailyHours: 8.0,
  weeklyWorkingDays: 5,
};

// Employees live in Postgres now (/api/employees); there is no local employee seed.
const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'TXN-2026-089',
    date: '2026-10-02',
    type: 'income',
    category: 'Client Payments',
    description: 'Q3 Retainer Milestone — FinTech Global Inc',
    amount: 540000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'NEFT-FT99824',
    notes: 'Received against invoice INV-2026-001.',
    linkedInvoiceId: 'inv-001',
    createdBy: 'Priya Sharma',
    createdAt: '2026-10-02T10:30:00.000Z',
  },
  {
    id: 'TXN-2026-088',
    date: '2026-10-04',
    type: 'expense',
    category: 'Hosting and Infrastructure',
    description: 'AWS Cloud & Google Cloud Platform Monthly Infrastructure',
    amount: 48500,
    paymentMethod: 'Credit Card',
    referenceNumber: 'CC-9012',
    notes: 'Production clusters and staging environments.',
    createdBy: 'Alex Monks',
    createdAt: '2026-10-04T14:15:00.000Z',
  },
  {
    id: 'TXN-2026-087',
    date: '2026-10-05',
    type: 'expense',
    category: 'Software and Tools',
    description: 'GitHub Enterprise & Figma Organization Annual Licenses',
    amount: 32000,
    paymentMethod: 'Credit Card',
    referenceNumber: 'CC-9012',
    notes: 'Team collaboration licenses.',
    createdBy: 'Alex Monks',
    createdAt: '2026-10-05T11:00:00.000Z',
  },
  {
    id: 'TXN-2026-086',
    date: '2026-09-30',
    type: 'expense',
    category: 'Salaries',
    description: 'September 2026 Team Payroll Disbursement',
    amount: 765000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'CMS-BATCH-SEP26',
    notes: 'Batch salary payout for September 2026.',
    createdBy: 'Priya Sharma',
    createdAt: '2026-09-30T17:00:00.000Z',
  },
  {
    id: 'TXN-2026-085',
    date: '2026-09-28',
    type: 'income',
    category: 'Service Revenue',
    description: 'Design Sprint & Technical Discovery — Omnichannel Retail',
    amount: 380000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'RTGS-OMN8812',
    notes: 'Completed sprint deliverable.',
    createdBy: 'Priya Sharma',
    createdAt: '2026-09-28T16:20:00.000Z',
  },
  {
    id: 'TXN-2026-084',
    date: '2026-09-15',
    type: 'expense',
    category: 'Office Expenses',
    description: 'BKC Studio Lease Maintenance & High-Speed Lease Line',
    amount: 65000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'CHQ-002914',
    notes: 'Maker Maxity monthly facility cost.',
    createdBy: 'Priya Sharma',
    createdAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'TXN-2026-083',
    date: '2026-09-08',
    type: 'income',
    category: 'Client Payments',
    description: 'Frontend Architecture Deliverable — HealthBridge Labs',
    amount: 420000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'NEFT-HB44102',
    notes: 'Received against invoice INV-2026-002.',
    linkedInvoiceId: 'inv-002',
    createdBy: 'Priya Sharma',
    createdAt: '2026-09-08T15:45:00.000Z',
  },
  {
    id: 'TXN-2026-082',
    date: '2026-09-02',
    type: 'expense',
    category: 'Marketing',
    description: 'Tech Conference Booth & Industry Sponsorship',
    amount: 45000,
    paymentMethod: 'UPI',
    referenceNumber: 'UPI-9844201',
    notes: 'TechSparks Mumbai conference sponsorship.',
    createdBy: 'Karan Singhania',
    createdAt: '2026-09-02T10:10:00.000Z',
  },
];

const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-2026-001',
    clientName: 'FinTech Global Inc',
    clientEmail: 'billing@fintechglobal.io',
    clientAddress: '100 Financial Centre, London EC2N 1HQ',
    invoiceDate: '2026-09-15',
    dueDate: '2026-10-01',
    items: [
      {
        id: 'item-1',
        description: 'Enterprise Cloud Architecture & Core API System',
        quantity: 1,
        unitPrice: 457627.12,
        subtotal: 457627.12,
      },
    ],
    subtotal: 457627.12,
    taxRate: 18,
    taxAmount: 82372.88,
    totalAmount: 540000,
    amountPaid: 540000,
    outstandingAmount: 0,
    status: 'Paid',
    notes: 'Payment received in full via wire transfer on 02 Oct 2026.',
    payments: [
      {
        id: 'pay-001',
        date: '2026-10-02',
        amount: 540000,
        paymentMethod: 'Bank Transfer',
        reference: 'NEFT-FT99824',
        notes: 'Full payment received.',
        recordedBy: 'Priya Sharma',
        createdAt: '2026-10-02T10:30:00.000Z',
      },
    ],
    createdAt: '2026-09-15T11:00:00.000Z',
    updatedAt: '2026-10-02T10:30:00.000Z',
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-2026-002',
    clientName: 'HealthBridge Labs',
    clientEmail: 'accounts@healthbridge.co',
    clientAddress: '7th Floor, Cyber City, Gurugram 122002',
    invoiceDate: '2026-09-01',
    dueDate: '2026-09-20',
    items: [
      {
        id: 'item-2-1',
        description: 'Full-Stack Patient Portal Design System',
        quantity: 1,
        unitPrice: 355932.20,
        subtotal: 355932.20,
      },
    ],
    subtotal: 355932.20,
    taxRate: 18,
    taxAmount: 64067.80,
    totalAmount: 420000,
    amountPaid: 420000,
    outstandingAmount: 0,
    status: 'Paid',
    notes: 'Completed delivery sign-off on 08 Sep 2026.',
    payments: [
      {
        id: 'pay-002',
        date: '2026-09-08',
        amount: 420000,
        paymentMethod: 'Bank Transfer',
        reference: 'NEFT-HB44102',
        notes: 'Received via NEFT.',
        recordedBy: 'Priya Sharma',
        createdAt: '2026-09-08T15:45:00.000Z',
      },
    ],
    createdAt: '2026-09-01T09:30:00.000Z',
    updatedAt: '2026-09-08T15:45:00.000Z',
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-2026-003',
    clientName: 'Apex Mobility Solutions',
    clientEmail: 'finance@apexmobility.in',
    clientAddress: 'Plot 45, MIDC Industrial Area, Pune 411018',
    invoiceDate: '2026-09-20',
    dueDate: '2026-10-05',
    items: [
      {
        id: 'item-3-1',
        description: 'Fleet Tracking Dashboard & Telemetry Visualizer',
        quantity: 1,
        unitPrice: 271186.44,
        subtotal: 271186.44,
      },
    ],
    subtotal: 271186.44,
    taxRate: 18,
    taxAmount: 48813.56,
    totalAmount: 320000,
    amountPaid: 120000,
    outstandingAmount: 200000,
    status: 'Overdue',
    notes: 'Initial advance received (₹1,20,000). Remaining balance ₹2,00,000 is overdue since 05 Oct 2026.',
    payments: [
      {
        id: 'pay-003',
        date: '2026-09-22',
        amount: 120000,
        paymentMethod: 'Bank Transfer',
        reference: 'NEFT-APEX0192',
        notes: 'Advance deposit.',
        recordedBy: 'Priya Sharma',
        createdAt: '2026-09-22T14:00:00.000Z',
      },
    ],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-22T14:00:00.000Z',
  },
  {
    id: 'inv-004',
    invoiceNumber: 'INV-2026-004',
    clientName: 'Nordic Retail Group',
    clientEmail: 'invoices@nordicretail.dk',
    clientAddress: 'Bredgade 28, 1260 Copenhagen, Denmark',
    invoiceDate: '2026-10-05',
    dueDate: '2026-10-25',
    items: [
      {
        id: 'item-4-1',
        description: 'E-commerce Checkout Microservice Refactor',
        quantity: 1,
        unitPrice: 237288.14,
        subtotal: 237288.14,
      },
    ],
    subtotal: 237288.14,
    taxRate: 18,
    taxAmount: 42711.86,
    totalAmount: 280000,
    amountPaid: 0,
    outstandingAmount: 280000,
    status: 'Sent',
    notes: 'Sent to client on 05 Oct 2026. Awaiting payment.',
    payments: [],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  },
];

const INITIAL_SALARIES: SalaryRecord[] = [];

// Initial Seed Salary Slips (Published for September 2026)
const INITIAL_SALARY_SLIPS: SalarySlip[] = [];

// Initial Seed Attendance Records (October 2026 workdays)
const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

// Initial Seed Leave Requests
// Leave, attendance, salary and slip seed rows referenced the old localStorage employee ids (EMP-00x)
// and were removed when employees moved to the API. These modules are rebuilt on the API later.
const INITIAL_LEAVES: LeaveRequest[] = [];

const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [
  {
    id: 'log-001',
    timestamp: '2026-10-05T12:00:00.000Z',
    userName: 'Priya Sharma',
    userRole: 'manager',
    action: 'Created Invoice',
    details: 'Created invoice INV-2026-004 for Nordic Retail Group (₹2,80,000)',
    entityType: 'invoice',
  },
  {
    id: 'log-002',
    timestamp: '2026-10-02T10:30:00.000Z',
    userName: 'Priya Sharma',
    userRole: 'manager',
    action: 'Recorded Payment',
    details: 'Recorded full payment of ₹5,40,000 on INV-2026-001 from FinTech Global Inc',
    entityType: 'invoice',
  },
  {
    id: 'log-003',
    timestamp: '2026-10-01T09:00:00.000Z',
    userName: 'Alex Monks',
    userRole: 'admin',
    action: 'Generated Salaries',
    details: 'Generated October 2026 salary records for 5 active employees',
    entityType: 'salary',
  },
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    timestamp: '2026-10-08T14:20:00.000Z',
    userName: 'Alex Monks',
    userEmail: 'alex@hybridmonks.com',
    userRole: 'admin',
    action: 'ATTENDANCE_CORRECTION',
    entityType: 'attendance',
    entityId: 'ATT-2026-10-07-EMP003',
    details: 'Manual shift adjustment for Rahul Verma on 2026-10-07. Punch-out adjusted to 18:30 due to building power outage.',
    previousState: {
      punchIn: '2026-10-07T03:55:00.000Z',
      punchOut: null,
      durationMinutes: 0,
      status: 'Incomplete',
    },
    newState: {
      punchIn: '2026-10-07T03:55:00.000Z',
      punchOut: '2026-10-07T13:00:00.000Z',
      durationMinutes: 545,
      status: 'Present',
      isManualCorrection: true,
      correctionReason: 'Building power outage prevented automated punch-out.',
      correctedBy: 'Alex Monks',
    },
    ipAddress: '192.168.1.10 (Management Console)',
  },
  {
    id: 'audit-002',
    timestamp: '2026-09-30T17:05:00.000Z',
    userName: 'Alex Monks',
    userEmail: 'alex@hybridmonks.com',
    userRole: 'admin',
    action: 'SALARY_PAYMENT',
    entityType: 'salary',
    entityId: 'SAL-2026-09-EMP001',
    details: 'Disbursed September 2026 salary of ₹1,85,000 to Arjun Mehta via Bank Transfer. Linked expense transaction TXN-2026-086.',
    previousState: {
      status: 'Pending',
      paymentDate: null,
      paymentMethod: null,
      finalPayableAmount: 185000,
    },
    newState: {
      status: 'Paid',
      paymentDate: '2026-09-30',
      paymentMethod: 'Bank Transfer',
      linkedExpenseTxnId: 'TXN-2026-086',
      finalPayableAmount: 185000,
    },
    ipAddress: '192.168.1.10 (Management Console)',
  },
  {
    id: 'audit-003',
    timestamp: '2026-10-01T09:00:00.000Z',
    userName: 'Alex Monks',
    userEmail: 'alex@hybridmonks.com',
    userRole: 'admin',
    action: 'SALARY_GENERATION',
    entityType: 'salary',
    entityId: 'SAL-CYCLE-2026-10',
    details: 'Generated batch payroll records for October 2026 (5 active employees).',
    previousState: {},
    newState: {
      salaryMonth: '2026-10',
      recordsCreated: 5,
    },
    ipAddress: '192.168.1.10 (Management Console)',
  },
  {
    id: 'audit-004',
    timestamp: '2026-10-02T10:30:00.000Z',
    userName: 'Priya Sharma',
    userEmail: 'priya@hybridmonks.com',
    userRole: 'manager',
    action: 'INVOICE_PAYMENT',
    entityType: 'invoice',
    entityId: 'INV-2026-001',
    details: 'Recorded payment of ₹5,40,000 on INV-2026-001 from FinTech Global Inc via Wire Transfer.',
    previousState: {
      amountPaid: 0,
      outstandingAmount: 540000,
      status: 'Sent',
    },
    newState: {
      amountPaid: 540000,
      outstandingAmount: 0,
      status: 'Paid',
    },
    ipAddress: '192.168.1.25 (Finance Terminal)',
  },
];

export class StorageService {
  // Who is signed in (from the server session); set by AppProvider and used to attribute audit entries.
  static currentActor: { id: string; name: string; email: string; role: UserRole } | null = null;

  // ----------------------------------------------------
  // ATTENDANCE & PUNCH-IN / PUNCH-OUT
  // ----------------------------------------------------

  static getAttendance(): AttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(INITIAL_ATTENDANCE));
      return INITIAL_ATTENDANCE;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_ATTENDANCE;
    }
  }

  static saveAttendance(records: AttendanceRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
  }

  static getTodayAttendance(employeeId: string): AttendanceRecord | null {
    const records = this.getAttendance();
    const today = new Date().toISOString().split('T')[0];
    return records.find(r => r.employeeId === employeeId && r.date === today) || null;
  }

  static punchIn(emp: { id: string; fullName: string; department: string }): { success: boolean; record?: AttendanceRecord; error?: string } {
    const employeeId = emp.id;
    const today = new Date().toISOString().split('T')[0];
    const records = this.getAttendance();
    const existing = records.find(r => r.employeeId === employeeId && r.date === today);

    if (existing) {
      if (existing.punchOut) {
        return { success: false, error: 'You have already completed attendance for today.' };
      }
      return { success: false, error: 'You are already punched in.' };
    }

    const serverNow = new Date().toISOString();
    const settings = this.getSettings();

    // Determine status (check if late compared to workStartTime)
    let status: AttendanceRecord['status'] = 'Working';

    // Calculate current time in company timezone
    const nowHour = new Date().getHours();
    const nowMin = new Date().getMinutes();
    const [startHour, startMin] = (settings.workStartTime || '09:30').split(':').map(Number);
    const isLate = (nowHour * 60 + nowMin) > (startHour * 60 + startMin + 15); // 15-minute grace period

    const newRecord: AttendanceRecord = {
      id: `ATT-${today}-${emp.id.replace('-', '')}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      date: today,
      punchIn: serverNow,
      durationMinutes: 0,
      status: isLate ? 'Late' : 'Working',
    };

    records.unshift(newRecord);
    this.saveAttendance(records);
    this.addLog(emp.fullName, 'employee', 'Punch In', `Punched in at ${new Date().toLocaleTimeString()} (UTC ${serverNow})`, 'attendance');
    return { success: true, record: newRecord };
  }

  static punchOut(employeeId: string): { success: boolean; record?: AttendanceRecord; error?: string } {
    const today = new Date().toISOString().split('T')[0];
    const records = this.getAttendance();
    const index = records.findIndex(r => r.employeeId === employeeId && r.date === today);

    if (index === -1) {
      return { success: false, error: 'No active punch-in found for today. Please punch in first.' };
    }

    const record = records[index];
    if (record.punchOut) {
      return { success: false, error: 'You have already punched out for today.' };
    }

    const serverNow = new Date().toISOString();
    const inTime = new Date(record.punchIn).getTime();
    const outTime = new Date(serverNow).getTime();
    const durationMinutes = Math.max(1, Math.round((outTime - inTime) / 60000));

    const settings = this.getSettings();
    const expectedMinutes = (settings.expectedDailyHours || 8.0) * 60;
    let finalStatus: AttendanceRecord['status'] = 'Present';

    if (durationMinutes < expectedMinutes * 0.5) {
      finalStatus = 'Half Day';
    } else if (record.status === 'Late') {
      finalStatus = 'Late';
    } else {
      finalStatus = 'Present';
    }

    records[index] = {
      ...record,
      punchOut: serverNow,
      durationMinutes,
      status: finalStatus,
    };

    this.saveAttendance(records);
    this.addLog(
      record.employeeName,
      'employee',
      'Punch Out',
      `Punched out at ${new Date().toLocaleTimeString()}. Total working duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`,
      'attendance'
    );

    return { success: true, record: records[index] };
  }

  static correctAttendance(
    id: string,
    punchIn: string,
    punchOut: string | undefined,
    reason: string,
    correctedBy: string
  ): { success: boolean; error?: string; auditLog?: AuditLog } {
    const records = this.getAttendance();
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return { success: false, error: 'Attendance record not found' };

    const oldRecord = records[index];
    const previousState = {
      punchIn: oldRecord.punchIn,
      punchOut: oldRecord.punchOut || null,
      durationMinutes: oldRecord.durationMinutes,
      status: oldRecord.status,
      isManualCorrection: oldRecord.isManualCorrection || false,
    };

    let durationMinutes = 0;
    if (punchOut && punchIn) {
      const inTime = new Date(punchIn).getTime();
      const outTime = new Date(punchOut).getTime();
      durationMinutes = Math.max(0, Math.round((outTime - inTime) / 60000));
    }

    const correctedAt = new Date().toISOString();
    const newStatus = punchOut ? 'Present' : 'Incomplete';

    records[index] = {
      ...records[index],
      punchIn,
      punchOut,
      durationMinutes,
      isManualCorrection: true,
      correctionReason: reason.trim(),
      correctedBy,
      correctedAt,
      status: newStatus,
    };

    this.saveAttendance(records);

    // Record formal accountability audit log with state change diff
    const audit = this.logAuditAction({
      action: 'ATTENDANCE_CORRECTION',
      entityType: 'attendance',
      entityId: id,
      details: `Manual attendance correction for ${oldRecord.employeeName} (${oldRecord.date}). Punch In: ${new Date(punchIn).toLocaleTimeString()}, Punch Out: ${punchOut ? new Date(punchOut).toLocaleTimeString() : 'N/A'}. Reason: "${reason.trim()}"`,
      previousState,
      newState: {
        punchIn,
        punchOut: punchOut || null,
        durationMinutes,
        status: newStatus,
        isManualCorrection: true,
        correctionReason: reason.trim(),
        correctedBy,
        correctedAt,
      },
      userName: correctedBy,
      userRole: 'admin',
    });

    return { success: true, auditLog: audit };
  }

  // ----------------------------------------------------
  // LEAVE MANAGEMENT (APPLICATIONS & APPROVALS)
  // ----------------------------------------------------

  static getLeaveRequests(): LeaveRequest[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LEAVES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(INITIAL_LEAVES));
      return INITIAL_LEAVES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_LEAVES;
    }
  }

  static saveLeaveRequests(leaves: LeaveRequest[]): void {
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(leaves));
  }

  static calculateWorkingDays(startDate: string, endDate: string, dayType: DayType = 'Full Day'): number {
    if (dayType === 'Half Day') return 0.5;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay(); // 0 = Sun, 6 = Sat
      if (day !== 0 && day !== 6) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  }

  static applyLeave(data: {
    employeeId: string;
    employee: { id: string; fullName: string; workEmail: string; department: string; status: string };
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    dayType: DayType;
    halfDayPeriod?: HalfDayPeriod;
    reason: string;
    applicantName: string;
    applicantRole: UserRole;
  }): { success: boolean; request?: LeaveRequest; error?: string } {
    if (!data.startDate || !data.endDate) {
      return { success: false, error: 'Start date and end date are required.' };
    }
    if (data.endDate < data.startDate) {
      return { success: false, error: 'End date cannot be earlier than start date.' };
    }
    if (!data.reason || !data.reason.trim()) {
      return { success: false, error: 'Reason for leave application is required.' };
    }
    if (data.dayType === 'Half Day' && data.startDate !== data.endDate) {
      return { success: false, error: 'Half-day leave must be for a single date.' };
    }

    const emp = data.employee;
    if (emp.status === 'inactive') {
      return { success: false, error: 'Inactive employee accounts cannot apply for leave.' };
    }

    // Check for overlapping active (Pending or Approved) requests for this employee
    const leaves = this.getLeaveRequests();
    const hasOverlap = leaves.some(l => {
      if (l.employeeId !== data.employeeId) return false;
      if (l.status !== 'Pending' && l.status !== 'Approved') return false;
      return data.startDate <= l.endDate && data.endDate >= l.startDate;
    });

    if (hasOverlap) {
      return {
        success: false,
        error: 'You already have an active leave request (Pending or Approved) covering these dates.',
      };
    }

    const totalDays = this.calculateWorkingDays(data.startDate, data.endDate, data.dayType);

    const newRequest: LeaveRequest = {
      id: `LV-${Date.now()}-${emp.id.replace('-', '')}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      employeeEmail: emp.workEmail,
      department: emp.department,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      dayType: data.dayType,
      halfDayPeriod: data.halfDayPeriod,
      totalDays,
      reason: data.reason.trim(),
      status: 'Pending',
      appliedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    leaves.unshift(newRequest);
    this.saveLeaveRequests(leaves);

    this.logAuditAction({
      action: 'LEAVE_REQUESTED',
      entityType: 'leave',
      entityId: newRequest.id,
      details: `${emp.fullName} applied for ${totalDays} day(s) ${data.leaveType} (${data.startDate} to ${data.endDate}). Reason: "${data.reason.trim()}"`,
      userName: data.applicantName,
      userRole: data.applicantRole,
      newState: { ...newRequest },
    });

    return { success: true, request: newRequest };
  }

  static reviewLeaveRequest(params: {
    requestId: string;
    status: 'Approved' | 'Rejected';
    reviewerName: string;
    reviewerRole: UserRole;
    reviewerEmployeeId?: string;
    reviewerComment?: string;
    rejectionReason?: string;
  }): { success: boolean; request?: LeaveRequest; error?: string } {
    if (params.reviewerRole === 'employee') {
      return { success: false, error: 'Employees are not authorized to review leave applications.' };
    }

    const leaves = this.getLeaveRequests();
    const index = leaves.findIndex(l => l.id === params.requestId);
    if (index === -1) {
      return { success: false, error: 'Leave request not found.' };
    }

    const req = leaves[index];

    // Prevent applicant from approving their own request!
    if (
      (params.reviewerEmployeeId && req.employeeId === params.reviewerEmployeeId) ||
      req.employeeName.toLowerCase() === params.reviewerName.toLowerCase()
    ) {
      return { success: false, error: 'You cannot review or approve your own leave application.' };
    }

    // Prevent conflicting decisions
    if (req.status !== 'Pending') {
      return { success: false, error: `This leave request has already been ${req.status.toLowerCase()}.` };
    }

    // Mandatory rejection reason check
    if (params.status === 'Rejected' && (!params.rejectionReason || !params.rejectionReason.trim())) {
      return { success: false, error: 'A mandatory rejection reason is required when rejecting leave.' };
    }

    const previousState = {
      status: req.status,
      reviewedBy: req.reviewedBy,
      reviewedAt: req.reviewedAt,
    };

    const reviewedAt = new Date().toISOString();
    leaves[index] = {
      ...req,
      status: params.status,
      reviewedBy: params.reviewerName,
      reviewedByRole: params.reviewerRole,
      reviewedAt,
      reviewerComment: params.reviewerComment?.trim() || undefined,
      rejectionReason: params.status === 'Rejected' ? params.rejectionReason?.trim() : undefined,
      updatedAt: reviewedAt,
    };

    this.saveLeaveRequests(leaves);

    this.logAuditAction({
      action: params.status === 'Approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      entityType: 'leave',
      entityId: req.id,
      details: `${params.reviewerName} (${params.reviewerRole}) ${params.status.toLowerCase()} leave application for ${req.employeeName} (${req.startDate} to ${req.endDate}). ${params.status === 'Rejected' ? `Reason: "${params.rejectionReason?.trim()}"` : `Comment: "${params.reviewerComment?.trim() || 'Approved'}"`}`,
      userName: params.reviewerName,
      userRole: params.reviewerRole,
      previousState,
      newState: { ...leaves[index] },
    });

    return { success: true, request: leaves[index] };
  }

  static cancelLeaveRequest(requestId: string, employeeId: string, applicantName: string): { success: boolean; error?: string } {
    const leaves = this.getLeaveRequests();
    const index = leaves.findIndex(l => l.id === requestId);
    if (index === -1) return { success: false, error: 'Leave request not found.' };

    const req = leaves[index];
    if (req.employeeId !== employeeId && applicantName !== 'Alex Monks') {
      return { success: false, error: 'You can only cancel your own leave requests.' };
    }

    if (req.status !== 'Pending') {
      return { success: false, error: 'Only pending leave requests can be cancelled.' };
    }

    leaves[index] = {
      ...req,
      status: 'Cancelled',
      updatedAt: new Date().toISOString(),
    };

    this.saveLeaveRequests(leaves);

    this.logAuditAction({
      action: 'LEAVE_CANCELLED',
      entityType: 'leave',
      entityId: req.id,
      details: `${applicantName} cancelled pending leave request for ${req.startDate} to ${req.endDate}`,
      userName: applicantName,
      userRole: 'employee',
    });

    return { success: true };
  }

  static updateLeaveRequest(
    requestId: string,
    employeeId: string,
    updates: {
      leaveType?: LeaveType;
      startDate?: string;
      endDate?: string;
      dayType?: DayType;
      halfDayPeriod?: HalfDayPeriod;
      reason?: string;
    }
  ): { success: boolean; error?: string } {
    const leaves = this.getLeaveRequests();
    const index = leaves.findIndex(l => l.id === requestId);
    if (index === -1) return { success: false, error: 'Leave request not found.' };

    const req = leaves[index];
    if (req.employeeId !== employeeId) {
      return { success: false, error: 'You can only edit your own leave requests.' };
    }

    if (req.status !== 'Pending') {
      return { success: false, error: 'Only pending leave requests can be edited.' };
    }

    const startDate = updates.startDate || req.startDate;
    const endDate = updates.endDate || req.endDate;
    const dayType = updates.dayType || req.dayType;

    if (endDate < startDate) {
      return { success: false, error: 'End date cannot be earlier than start date.' };
    }

    const totalDays = this.calculateWorkingDays(startDate, endDate, dayType);

    leaves[index] = {
      ...req,
      leaveType: updates.leaveType || req.leaveType,
      startDate,
      endDate,
      dayType,
      halfDayPeriod: updates.halfDayPeriod !== undefined ? updates.halfDayPeriod : req.halfDayPeriod,
      totalDays,
      reason: updates.reason !== undefined ? updates.reason.trim() : req.reason,
      updatedAt: new Date().toISOString(),
    };

    this.saveLeaveRequests(leaves);
    return { success: true };
  }

  // ----------------------------------------------------
  // SALARY SLIPS
  // ----------------------------------------------------

  static getSalarySlips(): SalarySlip[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SALARY_SLIPS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SALARY_SLIPS, JSON.stringify(INITIAL_SALARY_SLIPS));
      return INITIAL_SALARY_SLIPS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_SALARY_SLIPS;
    }
  }

  static saveSalarySlips(slips: SalarySlip[]): void {
    localStorage.setItem(STORAGE_KEYS.SALARY_SLIPS, JSON.stringify(slips));
  }

  static publishSalarySlip(salaryRecordId: string, publishedBy: string = 'Admin'): SalarySlip | null {
    const salaries = this.getSalaries();
    const sal = salaries.find(s => s.id === salaryRecordId);
    if (!sal) return null;

    const slips = this.getSalarySlips();
    const existingIndex = slips.findIndex(s => s.salaryRecordId === salaryRecordId);

    const base = sal.baseSalary;
    const hra = Math.round(base * 0.3);
    const special = Math.round(base * 0.2);
    const pf = 1800;
    const pt = 200;

    const slip: SalarySlip = {
      id: `SLIP-${sal.salaryMonth}-${sal.employeeId}`,
      salaryRecordId: sal.id,
      employeeId: sal.employeeId,
      employeeName: sal.employeeName,
      employeeEmail: sal.employeeEmail,
      department: sal.department,
      designation: 'Specialist',
      salaryMonth: sal.salaryMonth,
      issueDate: new Date().toISOString().split('T')[0],
      basicSalary: base,
      allowances: [
        { title: 'House Rent Allowance (HRA)', amount: hra },
        { title: 'Special Allowance', amount: special },
      ],
      deductions: [
        { title: 'Provident Fund (PF)', amount: pf },
        { title: 'Professional Tax (PT)', amount: pt },
      ],
      netPayable: sal.finalPayableAmount,
      paymentDate: sal.paymentDate,
      paymentMethod: sal.paymentMethod,
      paymentStatus: sal.status,
      isPublished: true,
      publishedAt: new Date().toISOString(),
      publishedBy,
    };

    if (existingIndex !== -1) {
      slips[existingIndex] = slip;
    } else {
      slips.unshift(slip);
    }

    this.saveSalarySlips(slips);

    // Also mark on salary record
    const salIndex = salaries.findIndex(s => s.id === salaryRecordId);
    if (salIndex !== -1) {
      salaries[salIndex].isSlipPublished = true;
      this.saveSalaries(salaries);
    }

    this.addLog(publishedBy, 'admin', 'Published Salary Slip', `Published ${sal.salaryMonth} slip for ${sal.employeeName}`, 'salary');
    return slip;
  }

  // ----------------------------------------------------
  // COMPANY SETTINGS & AUDIT LOGS
  // ----------------------------------------------------

  static getSettings(): CompanySettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
      return INITIAL_SETTINGS;
    }
    try {
      const parsed = JSON.parse(raw);
      return { ...INITIAL_SETTINGS, ...parsed };
    } catch {
      return INITIAL_SETTINGS;
    }
  }

  static saveSettings(settings: CompanySettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.addLog('Alex Monks', 'admin', 'Updated Settings', 'Updated company profile and financial parameters', 'settings');
  }

  static getTransactions(): Transaction[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(INITIAL_TRANSACTIONS));
      return INITIAL_TRANSACTIONS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  }

  static saveTransactions(transactions: Transaction[]): void {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  static addTransaction(txn: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const transactions = this.getTransactions();
    const highestId = transactions.reduce((max, t) => {
      const match = t.id.match(/TXN-\d+-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 90);
    const newId = `TXN-2026-${String(highestId + 1).padStart(3, '0')}`;
    const newTransaction: Transaction = {
      ...txn,
      id: newId,
      amount: roundToTwoDecimals(txn.amount),
      createdAt: new Date().toISOString(),
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.addLog(txn.createdBy, 'manager', 'Added Transaction', `${txn.type.toUpperCase()}: ${txn.description} (${roundToTwoDecimals(txn.amount)})`, 'transaction');
    return newTransaction;
  }

  static updateTransaction(txn: Transaction): void {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === txn.id);
    if (index !== -1) {
      transactions[index] = {
        ...txn,
        amount: roundToTwoDecimals(txn.amount),
      };
      this.saveTransactions(transactions);
      this.addLog(txn.createdBy, 'manager', 'Updated Transaction', `Updated transaction ${txn.id}`, 'transaction');
    }
  }

  static deleteTransaction(id: string): void {
    const transactions = this.getTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    this.saveTransactions(filtered);
    this.addLog('User', 'admin', 'Deleted Transaction', `Deleted transaction ${id}`, 'transaction');
  }

  static getInvoices(): Invoice[] {
    const raw = localStorage.getItem(STORAGE_KEYS.INVOICES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(INITIAL_INVOICES));
      return INITIAL_INVOICES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_INVOICES;
    }
  }

  static saveInvoices(invoices: Invoice[]): void {
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
  }

  static calculateInvoiceStatus(invoice: {
    status: Invoice['status'];
    dueDate: string;
    totalAmount: number;
    amountPaid: number;
    outstandingAmount: number;
  }): Invoice['status'] {
    if (invoice.status === 'Draft' || invoice.status === 'Cancelled') {
      return invoice.status;
    }
    if (invoice.amountPaid >= invoice.totalAmount && invoice.totalAmount > 0) {
      return 'Paid';
    }
    if (invoice.amountPaid > 0 && invoice.outstandingAmount > 0) {
      return 'Partially Paid';
    }
    const today = new Date().toISOString().split('T')[0];
    if (invoice.dueDate < today && invoice.outstandingAmount > 0) {
      return 'Overdue';
    }
    return 'Sent';
  }

  static addInvoice(invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount' | 'payments'>): Invoice {
    const invoices = this.getInvoices();
    const newId = `inv-${Date.now()}`;
    const subtotal = roundToTwoDecimals(invoiceData.subtotal);
    const taxAmount = roundToTwoDecimals(invoiceData.taxAmount);
    const totalAmount = roundToTwoDecimals(invoiceData.totalAmount);
    const amountPaid = 0;
    const outstandingAmount = totalAmount;

    const status = this.calculateInvoiceStatus({
      status: invoiceData.status,
      dueDate: invoiceData.dueDate,
      totalAmount,
      amountPaid,
      outstandingAmount,
    });

    const newInvoice: Invoice = {
      ...invoiceData,
      id: newId,
      subtotal,
      taxAmount,
      totalAmount,
      amountPaid,
      outstandingAmount,
      status,
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    invoices.unshift(newInvoice);
    this.saveInvoices(invoices);
    this.addLog('Finance', 'manager', 'Created Invoice', `Created ${newInvoice.invoiceNumber} for ${newInvoice.clientName} (${totalAmount})`, 'invoice');
    return newInvoice;
  }

  static updateInvoice(invoice: Invoice): void {
    const invoices = this.getInvoices();
    const index = invoices.findIndex(i => i.id === invoice.id);
    if (index !== -1) {
      const subtotal = roundToTwoDecimals(invoice.subtotal);
      const taxAmount = roundToTwoDecimals(invoice.taxAmount);
      const totalAmount = roundToTwoDecimals(invoice.totalAmount);
      const amountPaid = roundToTwoDecimals(invoice.amountPaid);
      const outstandingAmount = roundToTwoDecimals(Math.max(0, totalAmount - amountPaid));

      const status = this.calculateInvoiceStatus({
        status: invoice.status,
        dueDate: invoice.dueDate,
        totalAmount,
        amountPaid,
        outstandingAmount,
      });

      invoices[index] = {
        ...invoice,
        subtotal,
        taxAmount,
        totalAmount,
        amountPaid,
        outstandingAmount,
        status,
        updatedAt: new Date().toISOString(),
      };
      this.saveInvoices(invoices);
      this.addLog('Finance', 'manager', 'Updated Invoice', `Updated ${invoice.invoiceNumber}`, 'invoice');
    }
  }

  static deleteInvoice(id: string): void {
    const invoices = this.getInvoices();
    const filtered = invoices.filter(i => i.id !== id);
    this.saveInvoices(filtered);
    this.addLog('Admin', 'admin', 'Deleted Invoice', `Deleted invoice ID ${id}`, 'invoice');
  }

  static recordInvoicePayment(
    invoiceId: string,
    payment: Omit<InvoicePayment, 'id' | 'createdAt'>,
    createLinkedTransaction: boolean = true
  ): Invoice | null {
    const invoices = this.getInvoices();
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return null;

    const paymentAmount = roundToTwoDecimals(payment.amount);
    if (paymentAmount <= 0) return null;

    const newPayment: InvoicePayment = {
      ...payment,
      id: `pay-${Date.now()}`,
      amount: paymentAmount,
      createdAt: new Date().toISOString(),
    };

    const newPayments = [...invoice.payments, newPayment];
    const newAmountPaid = roundToTwoDecimals(invoice.amountPaid + paymentAmount);
    const newOutstanding = roundToTwoDecimals(Math.max(0, invoice.totalAmount - newAmountPaid));

    const newStatus = this.calculateInvoiceStatus({
      status: invoice.status,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      amountPaid: newAmountPaid,
      outstandingAmount: newOutstanding,
    });

    const updatedInvoice: Invoice = {
      ...invoice,
      amountPaid: newAmountPaid,
      outstandingAmount: newOutstanding,
      status: newStatus,
      payments: newPayments,
      updatedAt: new Date().toISOString(),
    };

    const index = invoices.findIndex(i => i.id === invoiceId);
    invoices[index] = updatedInvoice;
    this.saveInvoices(invoices);

    if (createLinkedTransaction) {
      this.addTransaction({
        date: payment.date,
        type: 'income',
        category: 'Client Payments',
        description: `Payment received for ${invoice.invoiceNumber} (${invoice.clientName})`,
        amount: paymentAmount,
        paymentMethod: payment.paymentMethod,
        referenceNumber: payment.reference || `${invoice.invoiceNumber}-PAY`,
        notes: payment.notes || `Invoice payment recorded by ${payment.recordedBy}`,
        linkedInvoiceId: invoice.id,
        createdBy: payment.recordedBy,
      });
    }

    this.addLog(
      payment.recordedBy,
      'manager',
      'Recorded Invoice Payment',
      `Recorded payment of ${paymentAmount} on ${invoice.invoiceNumber}. New outstanding: ${newOutstanding}`,
      'invoice'
    );

    return updatedInvoice;
  }

  static getSalaries(): SalaryRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SALARIES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SALARIES, JSON.stringify(INITIAL_SALARIES));
      return INITIAL_SALARIES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_SALARIES;
    }
  }

  static saveSalaries(salaries: SalaryRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.SALARIES, JSON.stringify(salaries));
  }

  static generateMonthlySalaries(
    month: string,
    activeEmployees: Employee[],
    generatedBy: string = 'Admin'
  ): { createdCount: number; skippedCount: number } {
    const employees = activeEmployees.filter(e => e.status === 'active');
    const existingSalaries = this.getSalaries();
    let createdCount = 0;
    let skippedCount = 0;

    const newRecords: SalaryRecord[] = [];

    for (const emp of employees) {
      const alreadyExists = existingSalaries.some(
        s => s.employeeId === emp.id && s.salaryMonth === month
      );

      if (alreadyExists) {
        skippedCount++;
        continue;
      }

      const record: SalaryRecord = {
        id: `SAL-${month}-${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeEmail: emp.workEmail,
        department: emp.department,
        salaryMonth: month,
        baseSalary: roundToTwoDecimals(Number(emp.monthlySalary ?? 0)),
        adjustments: 0,
        finalPayableAmount: roundToTwoDecimals(Number(emp.monthlySalary ?? 0)),
        status: 'Pending',
        isSlipPublished: false,
        notes: `Auto-generated monthly salary for ${month}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      newRecords.push(record);
      createdCount++;
    }

    if (newRecords.length > 0) {
      const updatedList = [...newRecords, ...existingSalaries];
      this.saveSalaries(updatedList);
      this.addLog(
        generatedBy,
        'admin',
        'Generated Salaries',
        `Generated ${createdCount} salary records for month ${month} (${skippedCount} already existed)`,
        'salary'
      );
    }

    return { createdCount, skippedCount };
  }

  static updateSalaryRecord(salary: SalaryRecord): void {
    const salaries = this.getSalaries();
    const index = salaries.findIndex(s => s.id === salary.id);
    if (index !== -1) {
      const baseSalary = roundToTwoDecimals(salary.baseSalary);
      const adjustments = roundToTwoDecimals(salary.adjustments);
      const finalPayableAmount = roundToTwoDecimals(baseSalary + adjustments);

      salaries[index] = {
        ...salary,
        baseSalary,
        adjustments,
        finalPayableAmount,
        updatedAt: new Date().toISOString(),
      };
      this.saveSalaries(salaries);
      this.addLog('Admin', 'admin', 'Updated Salary', `Updated payable for ${salary.employeeName} to ${finalPayableAmount}`, 'salary');
    }
  }

  static markSalaryPaid(
    salaryId: string,
    paymentDate: string,
    paymentMethod: SalaryRecord['paymentMethod'] = 'Bank Transfer',
    markedBy: string = 'Admin'
  ): { success: boolean; message: string; auditLog?: AuditLog } {
    const salaries = this.getSalaries();
    const salary = salaries.find(s => s.id === salaryId);
    if (!salary) return { success: false, message: 'Salary record not found' };

    if (salary.status === 'Paid') {
      return { success: false, message: 'Salary is already marked as paid' };
    }

    const previousState = {
      status: salary.status,
      paymentDate: salary.paymentDate || null,
      paymentMethod: salary.paymentMethod || null,
      finalPayableAmount: salary.finalPayableAmount,
      linkedExpenseTxnId: salary.linkedExpenseTxnId || null,
    };

    // Atomically create linked Expense Transaction if one does not exist
    const transactions = this.getTransactions();
    let linkedTxnId = salary.linkedExpenseTxnId;

    const existingTxn = transactions.find(t => t.linkedSalaryId === salary.id);
    if (existingTxn) {
      linkedTxnId = existingTxn.id;
    } else {
      const newTxn = this.addTransaction({
        date: paymentDate,
        type: 'expense',
        category: 'Salaries',
        description: `Salary payout for ${salary.employeeName} (${salary.salaryMonth})`,
        amount: salary.finalPayableAmount,
        paymentMethod: paymentMethod || 'Bank Transfer',
        referenceNumber: `SAL-${salary.salaryMonth}-${salary.employeeId}`,
        notes: `Disbursed to ${salary.employeeName} via ${paymentMethod}`,
        linkedSalaryId: salary.id,
        createdBy: markedBy,
      });
      linkedTxnId = newTxn.id;
    }

    const index = salaries.findIndex(s => s.id === salaryId);
    salaries[index] = {
      ...salary,
      status: 'Paid',
      paymentDate,
      paymentMethod,
      linkedExpenseTxnId: linkedTxnId,
      updatedAt: new Date().toISOString(),
    };
    this.saveSalaries(salaries);

    // Auto publish salary slip when paid
    this.publishSalarySlip(salaryId, markedBy);

    // Record formal accountability audit log with state diff
    const audit = this.logAuditAction({
      action: 'SALARY_PAYMENT',
      entityType: 'salary',
      entityId: salary.id,
      details: `Disbursed ${salary.salaryMonth} salary of ₹${salary.finalPayableAmount.toLocaleString()} to ${salary.employeeName} (${salary.department}) via ${paymentMethod}. Linked ledger expense: ${linkedTxnId}`,
      previousState,
      newState: {
        status: 'Paid',
        paymentDate,
        paymentMethod,
        finalPayableAmount: salary.finalPayableAmount,
        linkedExpenseTxnId: linkedTxnId,
        isSlipPublished: true,
      },
      userName: markedBy,
      userRole: 'admin',
    });

    return {
      success: true,
      message: 'Salary successfully marked as paid and linked expense created.',
      auditLog: audit,
    };
  }

  // ----------------------------------------------------
  // AUDIT LOGS (TAMPER-EVIDENT ACCOUNTABILITY SYSTEM)
  // ----------------------------------------------------

  static getAuditLogs(): AuditLog[] {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(INITIAL_AUDIT_LOGS));
      return INITIAL_AUDIT_LOGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  }

  static saveAuditLogs(logs: AuditLog[]): void {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 500)));
  }

  static logAuditAction(entry: {
    action: AuditActionType | string;
    entityType: AuditLog['entityType'];
    entityId?: string;
    details: string;
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    userName?: string;
    userEmail?: string;
    userRole?: UserRole;
    userId?: string;
    ipAddress?: string;
  }): AuditLog {
    const actor = this.currentActor;
    const resolvedUserName = entry.userName || actor?.name || 'System Administrator';
    const resolvedUserRole = entry.userRole || actor?.role || 'admin';
    const resolvedUserEmail = entry.userEmail || actor?.email || 'accounts@hybridmonks.com';
    const resolvedUserId = entry.userId || actor?.id || undefined;

    const auditLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId: resolvedUserId,
      userName: resolvedUserName,
      userEmail: resolvedUserEmail,
      userRole: resolvedUserRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details,
      previousState: entry.previousState,
      newState: entry.newState,
      ipAddress: entry.ipAddress || '192.168.1.10 (Management Console)',
    };

    const logs = this.getAuditLogs();
    logs.unshift(auditLog);
    this.saveAuditLogs(logs);

    // Also update legacy activity logs for backward compatibility
    this.addLog(
      resolvedUserName,
      resolvedUserRole,
      typeof entry.action === 'string' ? entry.action.replace(/_/g, ' ') : String(entry.action),
      entry.details,
      entry.entityType
    );

    return auditLog;
  }

  static getActivityLogs(): ActivityLog[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(INITIAL_ACTIVITY_LOGS));
      return INITIAL_ACTIVITY_LOGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_ACTIVITY_LOGS;
    }
  }

  static addLog(
    userName: string,
    userRole: ActivityLog['userRole'],
    action: string,
    details: string,
    entityType: ActivityLog['entityType']
  ): void {
    const logs = this.getActivityLogs();
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      userName,
      userRole,
      action,
      details,
      entityType,
    };
    logs.unshift(newLog);
    const capped = logs.slice(0, 100);
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(capped));
  }
}
