import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { authApi, SessionUser } from '../api/auth';
import { setSessionHandlers } from '../api/client';

interface AuthContextType {
  // 'loading' until the first GET /api/auth/me has answered.
  status: 'loading' | 'ready';
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Left behind in browsers by the old localStorage-only prototype (it stored users and passwords there).
function removeLegacyAuthStorage() {
  try {
    const legacy = ['monks_auth_users_v1', 'monks_active_session_v1', 'monks_active_user_v1', 'monks_invitations_v1'];
    legacy.forEach(key => localStorage.removeItem(key));
    Object.keys(localStorage)
      .filter(key => key.startsWith('monks_reset_'))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // storage unavailable: nothing to clean
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    removeLegacyAuthStorage();

    // Any API call can tell us the session ended or that a password change is now required.
    setSessionHandlers({
      onUnauthenticated: () => setUser(null),
      onPasswordChangeRequired: () => setUser(current => (current ? { ...current, mustChangePassword: true } : current)),
    });

    let cancelled = false;
    authApi
      .me()
      .then(me => !cancelled && setUser(me))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setStatus('ready'));

    return () => {
      cancelled = true;
      setSessionHandlers(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password));
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setUser(await authApi.changePassword(currentPassword, newPassword));
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, changePassword }),
    [status, user, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
