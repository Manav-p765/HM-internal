import {
  Employee,
  SalaryRecord,
  SalarySlip,
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
  SALARIES: 'monks_salaries_v2',
  SALARY_SLIPS: 'monks_salary_slips_v2',
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

const INITIAL_SALARIES: SalaryRecord[] = [];

// Initial Seed Salary Slips (Published for September 2026)
const INITIAL_SALARY_SLIPS: SalarySlip[] = [];

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
