import React, { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';

export const PageLoading: React.FC<{ fullScreen?: boolean }> = ({ fullScreen }) => (
  <div
    className={`${fullScreen ? 'min-h-screen' : 'py-24'} flex items-center justify-center text-xs text-[#7185A5]`}
    role="status"
  >
    Loading...
  </div>
);

// Signed-in users only. Unknown session -> /login (remembering where they were going);
// a temporary password -> /change-password until it is replaced.
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoading fullScreen />;
  if (!user) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
};

// Cosmetic-plus guard for role-restricted pages: the server still refuses the data,
// this just keeps people off pages they can't use.
export const RequireRole: React.FC<{ roles: UserRole[] }> = ({ roles }) => {
  const { currentUser, showToast } = useApp();
  const allowed = roles.includes(currentUser.role);
  const toasted = useRef(false);

  useEffect(() => {
    if (!allowed && !toasted.current) {
      toasted.current = true;
      showToast('error', 'You do not have access to that page.');
    }
  }, [allowed, showToast]);

  return allowed ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

// Where a signed-in user starts: client (portal) users and staff live in separate shells.
export const homeFor = (role: string) => (role === 'client' ? '/portal' : '/dashboard');

// Only return to a remembered page that belongs to the user's own shell.
function safeReturnPath(from: string | undefined, role: string): string {
  if (!from) return homeFor(role);
  const isPortalPath = from === '/portal' || from.startsWith('/portal/');
  return isPortalPath === (role === 'client') ? from : homeFor(role);
}

// Client users only (the portal). Staff who open a portal URL go to their dashboard.
export const RequireClient: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user && user.role !== 'client') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// Staff only. A client typing any staff URL lands on the portal dashboard.
export const RequireStaff: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === 'client') return <Navigate to="/portal" replace />;
  return <>{children}</>;
};

// Pages for signed-out visitors (login, forgot password). A signed-in user is sent on.
export const RedirectIfSignedIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoading fullScreen />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={user.mustChangePassword ? '/change-password' : safeReturnPath(from, user.role)} replace />;
  }
  return <>{children}</>;
};

// /change-password is only meaningful while a temporary password is in use.
export const RequirePasswordChange: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  if (status === 'loading') return <PageLoading fullScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
};
