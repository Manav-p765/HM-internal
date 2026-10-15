import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import {
  Transaction,
  UserProfile,
  ActivityLog,
  AuditLog,
  AuditActionType,
} from '../types';
import { StorageService } from '../services/storage';
import { useAuth } from './AuthContext';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface AppContextType {
  // Signed-in user (from the server session via AuthContext, mapped to the shape the views use)
  currentUser: UserProfile;

  // Transactions & Accounting
  transactions: Transaction[];
  addTransaction: (txn: Omit<Transaction, 'id' | 'createdAt'>) => Transaction;
  updateTransaction: (txn: Transaction) => void;
  deleteTransaction: (id: string) => void;

  // Invoices and company settings live on the server (api/invoices.ts, api/settings.ts); pages fetch them.

  // Salaries and payslips live on the server (api/salary.ts); pages fetch them.

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

  const [transactions, setTransactions] = useState<Transaction[]>(StorageService.getTransactions());
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(StorageService.getActivityLogs());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(StorageService.getAuditLogs());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Quick Action Modal states
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);

  const refreshData = () => {
    setTransactions(StorageService.getTransactions());
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
        transactions,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        auditLogs,
        activityLogs,
        logAuditAction,
        toasts,
        showToast,
        dismissToast,
        isAddTransactionOpen,
        setIsAddTransactionOpen,
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
