import {
  ActivityLog,
  AuditLog,
  AuditActionType,
  UserRole,
} from '../types';

const STORAGE_KEYS = {
  // The ledger (transactions, categories), invoices, salaries and settings live on the server; the old
  // monks_transactions_* and monks_salar* keys are removed at sign-in (AuthContext). Only the activity and
  // audit logs below are still local.
  ACTIVITY_LOGS: 'monks_activity_logs_v1',
  AUDIT_LOGS: 'monks_audit_logs_v1',
};

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
