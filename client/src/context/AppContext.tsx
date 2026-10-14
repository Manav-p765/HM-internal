import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import {
  CompanySettings,
  Employee,
  Invoice,
  InvoicePayment,
  SalaryRecord,
  SalarySlip,
  Transaction,
  UserProfile,
  ActivityLog,
  AuditLog,
  AuditActionType,
  AttendanceRecord,
} from '../types';
import { StorageService } from '../services/storage';
import { useAuth } from './AuthContext';
import { employeesApi } from '../api/employees';
import { errorMessage } from '../api/client';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface AppContextType {
  // Signed-in user (from the server session via AuthContext, mapped to the shape the views use)
  currentUser: UserProfile;

  // Settings
  settings: CompanySettings;
  updateSettings: (newSettings: CompanySettings) => void;

  // Transactions & Accounting
  transactions: Transaction[];
  addTransaction: (txn: Omit<Transaction, 'id' | 'createdAt'>) => Transaction;
  updateTransaction: (txn: Transaction) => void;
  deleteTransaction: (id: string) => void;

  // Invoices
  invoices: Invoice[];
  addInvoice: (inv: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount' | 'payments'>) => Invoice;
  updateInvoice: (inv: Invoice) => void;
  deleteInvoice: (id: string) => void;
  recordInvoicePayment: (invoiceId: string, payment: Omit<InvoicePayment, 'id' | 'createdAt'>, createLinkedTxn?: boolean) => boolean;

  // Salaries & Payroll
  salaries: SalaryRecord[];
  generateMonthlySalaries: (month: string) => Promise<{ createdCount: number; skippedCount: number } | null>;
  updateSalaryRecord: (salary: SalaryRecord) => void;
  markSalaryPaid: (salaryId: string, paymentDate: string, paymentMethod?: SalaryRecord['paymentMethod']) => boolean;
  publishSalarySlip: (salaryRecordId: string) => boolean;
  salarySlips: SalarySlip[];
  mySalarySlips: SalarySlip[];

  // Attendance
  attendance: AttendanceRecord[];
  todayAttendance: AttendanceRecord | null;
  punchIn: () => { success: boolean; error?: string };
  punchOut: () => { success: boolean; error?: string };
  correctAttendance: (id: string, punchIn: string, punchOut: string | undefined, reason: string) => { success: boolean; error?: string };

  // Audit Logs & Accountability
  auditLogs: AuditLog[];
  activityLogs: ActivityLog[];
  logAuditAction: (entry: Parameters<typeof StorageService.logAuditAction>[0]) => AuditLog;

  // Toasts
  toasts: Toast[];
  showToast: (type: 'success' | 'error' | 'info', message: string, title?: string) => void;
  dismissToast: (id: string) => void;

  // Quick Action Modals
  isAddTransactionOpen: boolean;
  setIsAddTransactionOpen: (open: boolean) => void;
  isAddInvoiceOpen: boolean;
  setIsAddInvoiceOpen: (open: boolean) => void;
  isAddEmployeeOpen: boolean;
  setIsAddEmployeeOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // AppProvider is only mounted for a signed-in user (see App.tsx).
  const { user } = useAuth();
  if (!user) {
    throw new Error('AppProvider requires a signed-in user');
  }

  const [settings, setSettingsState] = useState<CompanySettings>(StorageService.getSettings());
  const [transactions, setTransactions] = useState<Transaction[]>(StorageService.getTransactions());
  const [invoices, setInvoices] = useState<Invoice[]>(StorageService.getInvoices());
  const [salaries, setSalaries] = useState<SalaryRecord[]>(StorageService.getSalaries());
  const [salarySlips, setSalarySlips] = useState<SalarySlip[]>(StorageService.getSalarySlips());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(StorageService.getAttendance());
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(StorageService.getActivityLogs());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(StorageService.getAuditLogs());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Quick Action Modal states
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);

  const refreshData = () => {
    setSettingsState(StorageService.getSettings());
    setTransactions(StorageService.getTransactions());
    setInvoices(StorageService.getInvoices());
    setSalaries(StorageService.getSalaries());
    setSalarySlips(StorageService.getSalarySlips());
    setAttendance(StorageService.getAttendance());
    setActivityLogs(StorageService.getActivityLogs());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    setToasts(prev => [...prev, { id, type, message, title }]);
    setTimeout(() => {
      dismissToast(id);
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Straight from the server session; name, designation, department and avatar come from the linked
  // employee record (null when the account isn't linked to one).
  const currentUser: UserProfile = useMemo(() => {
    const roleTitle = { admin: 'Administrator', manager: 'Manager', employee: 'Team Member', client: 'Client' }[user.role];
    return {
      id: user.id,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || '',
      designation: user.designation || roleTitle,
      department: user.department || undefined,
      employeeId: user.employeeId || undefined,
    };
  }, [user]);

  // Audit entries written by the storage layer are attributed to the signed-in user.
  StorageService.currentActor = {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
  };

  // Attendance Handlers
  const todayAttendance = useMemo(() => {
    if (!currentUser.employeeId) return null;
    return StorageService.getTodayAttendance(currentUser.employeeId);
  }, [currentUser.employeeId, attendance]);

  const punchIn = () => {
    if (!currentUser.employeeId) {
      showToast('error', 'Your user account is not linked to an employee record.');
      return { success: false, error: 'No linked employee record' };
    }
    const res = StorageService.punchIn({
      id: currentUser.employeeId,
      fullName: currentUser.name,
      department: currentUser.department || '',
    });
    if (res.success) {
      refreshData();
      showToast('success', `Punched in successfully at ${new Date().toLocaleTimeString()}! Have a great day.`);
      return { success: true };
    }
    showToast('error', res.error || 'Failed to punch in');
    return { success: false, error: res.error };
  };

  const punchOut = () => {
    if (!currentUser.employeeId) {
      showToast('error', 'Your user account is not linked to an employee record.');
      return { success: false, error: 'No linked employee record' };
    }
    const res = StorageService.punchOut(currentUser.employeeId);
    if (res.success && res.record) {
      refreshData();
      const h = Math.floor(res.record.durationMinutes / 60);
      const m = res.record.durationMinutes % 60;
      showToast('success', `Punched out successfully. Total workday duration: ${h}h ${m}m.`);
      return { success: true };
    }
    showToast('error', res.error || 'Failed to punch out');
    return { success: false, error: res.error };
  };

  const correctAttendance = (
    id: string,
    punchInTime: string,
    punchOutTime: string | undefined,
    reason: string
  ) => {
    const res = StorageService.correctAttendance(id, punchInTime, punchOutTime, reason, currentUser.name);
    if (res.success) {
      refreshData();
      showToast('success', 'Attendance record corrected and logged in audit history.');
      return { success: true };
    }
    showToast('error', res.error || 'Correction failed');
    return { success: false, error: res.error };
  };

  // Salary Slip Handlers
  const publishSalarySlip = (salaryRecordId: string) => {
    const res = StorageService.publishSalarySlip(salaryRecordId, currentUser.name);
    if (res) {
      refreshData();
      showToast('success', `Salary slip published for ${res.employeeName}`);
      return true;
    }
    showToast('error', 'Failed to publish salary slip');
    return false;
  };

  const mySalarySlips = useMemo(() => {
    if (!currentUser.employeeId) return [];
    return salarySlips.filter(s => s.employeeId === currentUser.employeeId && s.isPublished);
  }, [currentUser.employeeId, salarySlips]);

  // Existing methods preserved exactly
  const updateSettings = (newSettings: CompanySettings) => {
    StorageService.saveSettings(newSettings);
    setSettingsState(newSettings);
    showToast('success', 'Company settings updated successfully');
  };

  const addTransaction = (txn: Omit<Transaction, 'id' | 'createdAt'>): Transaction => {
    const created = StorageService.addTransaction(txn);
    refreshData();
    showToast('success', `${txn.type === 'income' ? 'Income' : 'Expense'} transaction recorded`);
    return created;
  };

  const updateTransaction = (txn: Transaction) => {
    StorageService.updateTransaction(txn);
    refreshData();
    showToast('success', 'Transaction updated successfully');
  };

  const deleteTransaction = (id: string) => {
    StorageService.deleteTransaction(id);
    refreshData();
    showToast('info', 'Transaction deleted');
  };

  const addInvoice = (inv: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount' | 'payments'>): Invoice => {
    const created = StorageService.addInvoice(inv);
    refreshData();
    showToast('success', `Invoice ${created.invoiceNumber} created`);
    return created;
  };

  const updateInvoice = (inv: Invoice) => {
    StorageService.updateInvoice(inv);
    refreshData();
    showToast('success', `Invoice ${inv.invoiceNumber} updated`);
  };

  const deleteInvoice = (id: string) => {
    StorageService.deleteInvoice(id);
    refreshData();
    showToast('info', 'Invoice deleted');
  };

  const recordInvoicePayment = (
    invoiceId: string,
    payment: Omit<InvoicePayment, 'id' | 'createdAt'>,
    createLinkedTxn: boolean = true
  ): boolean => {
    const updated = StorageService.recordInvoicePayment(invoiceId, payment, createLinkedTxn);
    if (updated) {
      refreshData();
      showToast('success', `Payment of ₹${payment.amount.toLocaleString('en-IN')} recorded on ${updated.invoiceNumber}`);
      return true;
    }
    showToast('error', 'Failed to record invoice payment');
    return false;
  };

  // Salary records are still local; the employee list (with salaries, admin only) comes from the API.
  const generateMonthlySalaries = async (month: string) => {
    let activeEmployees: Employee[];
    try {
      activeEmployees = (await employeesApi.list({ status: 'active', limit: 200 })).employees;
    } catch (err) {
      showToast('error', errorMessage(err));
      return null;
    }
    const result = StorageService.generateMonthlySalaries(month, activeEmployees, currentUser.name);
    refreshData();
    if (result.createdCount > 0) {
      showToast('success', `Generated ${result.createdCount} salary records for ${month}`);
    } else {
      showToast('info', `All active employees already have salary records for ${month}`);
    }
    return result;
  };

  const updateSalaryRecord = (salary: SalaryRecord) => {
    StorageService.updateSalaryRecord(salary);
    refreshData();
    showToast('success', `Salary record for ${salary.employeeName} updated`);
  };

  const markSalaryPaid = (
    salaryId: string,
    paymentDate: string,
    paymentMethod: SalaryRecord['paymentMethod'] = 'Bank Transfer'
  ): boolean => {
    const res = StorageService.markSalaryPaid(salaryId, paymentDate, paymentMethod, currentUser.name);
    refreshData();
    if (res.success) {
      showToast('success', res.message);
      return true;
    }
    showToast('error', res.message);
    return false;
  };

  const logAuditAction = (entry: Parameters<typeof StorageService.logAuditAction>[0]) => {
    const log = StorageService.logAuditAction({
      ...entry,
      userName: entry.userName || currentUser.name,
      userRole: entry.userRole || currentUser.role,
      userEmail: entry.userEmail || currentUser.email,
      userId: entry.userId || currentUser.id,
    });
    refreshData();
    return log;
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        settings,
        updateSettings,
        transactions,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        invoices,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        recordInvoicePayment,
        salaries,
        generateMonthlySalaries,
        updateSalaryRecord,
        markSalaryPaid,
        publishSalarySlip,
        salarySlips,
        mySalarySlips,
        attendance,
        todayAttendance,
        punchIn,
        punchOut,
        correctAttendance,
        auditLogs,
        activityLogs,
        logAuditAction,
        toasts,
        showToast,
        dismissToast,
        isAddTransactionOpen,
        setIsAddTransactionOpen,
        isAddInvoiceOpen,
        setIsAddInvoiceOpen,
        isAddEmployeeOpen,
        setIsAddEmployeeOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
