import {
  Transaction,
  ActivityLog,
  AuditLog,
  AuditActionType,
  UserRole,
} from '../types';
import { roundToTwoDecimals } from '../utils/formatters';

const STORAGE_KEYS = {
  // v2: the invoice payments that used to live here are income transactions on the server now
  // (invoices, payments and company settings moved to /api/invoices and /api/settings).
  TRANSACTIONS: 'monks_transactions_v2',
  // Salaries and payslips moved to the API (/api/salary); their old keys are removed in AuthContext.
  ACTIVITY_LOGS: 'monks_activity_logs_v1',
  AUDIT_LOGS: 'monks_audit_logs_v1',
};

// Employees live in Postgres now (/api/employees); there is no local employee seed.
const INITIAL_TRANSACTIONS: Transaction[] = [
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
  // TRANSACTIONS & AUDIT LOGS
  // ----------------------------------------------------

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
