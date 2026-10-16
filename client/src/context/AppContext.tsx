import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { UserProfile } from '../types';
import { useAuth } from './AuthContext';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

// Staff-shell UI state only: the signed-in user (from the server session), toasts and quick-action modals.
// No business data lives here or in localStorage: every page fetches its data from the API
// (api/*.ts with useApiData), and the audit trail is written by the server (audit_logs).
interface AppContextType {
  currentUser: UserProfile;

  toasts: Toast[];
  showToast: (type: 'success' | 'error' | 'info', message: string, title?: string) => void;
  dismissToast: (id: string) => void;

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

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);

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

  return (
    <AppContext.Provider
      value={{
        currentUser,
        toasts,
        showToast,
        dismissToast,
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
