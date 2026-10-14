/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { ToastContainer } from './components/common/ToastContainer';
import { AuthPage } from './components/auth/AuthPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { ChangePasswordPage } from './components/auth/ChangePasswordPage';
import { PageLoading, RedirectIfSignedIn, RequireAuth, RequirePasswordChange, RequireRole } from './routes/guards';

// Pages are split into their own chunks and loaded on first visit.
const named = <T extends Record<string, React.ComponentType<any>>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then(module => ({ default: module[name] })));

const DashboardView = named(() => import('./components/dashboard/DashboardView'), 'DashboardView');
const EmployeeDashboardView = named(() => import('./components/dashboard/EmployeeDashboardView'), 'EmployeeDashboardView');
const AccountingView = named(() => import('./components/accounting/AccountingView'), 'AccountingView');
const InvoicesView = named(() => import('./components/invoices/InvoicesView'), 'InvoicesView');
const EmployeesView = named(() => import('./components/employees/EmployeesView'), 'EmployeesView');
const SalaryView = named(() => import('./components/salary/SalaryView'), 'SalaryView');
const EmployeeSalarySlipsView = named(() => import('./components/salary/EmployeeSalarySlipsView'), 'EmployeeSalarySlipsView');
const ReportsView = named(() => import('./components/reports/ReportsView'), 'ReportsView');
const TeamDirectoryView = named(() => import('./components/directory/TeamDirectoryView'), 'TeamDirectoryView');
const SettingsView = named(() => import('./components/settings/SettingsView'), 'SettingsView');
const EmployeeProfileView = named(() => import('./components/profile/EmployeeProfileView'), 'EmployeeProfileView');
// Deferred (no routes yet): attendance/AdminAttendanceView, attendance/EmployeeAttendanceView, leaves.

// Dashboard differs by role: staff get their personal workspace.
const Dashboard: React.FC = () => {
  const { currentUser } = useApp();
  return currentUser.role === 'employee' ? <EmployeeDashboardView /> : <DashboardView />;
};

const MainLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <TopNav
          onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          searchQuery={globalSearch}
          setSearchQuery={setGlobalSearch}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>

        <footer className="px-6 py-4 border-t border-[#DFE6F1] bg-white text-xs text-[#7185A5] flex flex-col sm:flex-row items-center justify-between gap-2 no-print">
          <div>&copy; 2026 Hybrid Monks. Monks Internal Management System.</div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Confidential Internal Portal</span>
            <span>·</span>
            <span className="font-mono">v1.2.0-prod</span>
          </div>
        </footer>
      </div>

      <ToastContainer />
    </div>
  );
};

// Everything behind sign-in. Keyed by user so nothing from a previous sign-in survives in memory.
const SignedInApp: React.FC = () => {
  const { user } = useAuth();
  return (
    <RequireAuth>
      <AppProvider key={user?.id}>
        <MainLayout />
      </AppProvider>
    </RequireAuth>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfSignedIn><AuthPage mode="login" /></RedirectIfSignedIn>} />
          <Route path="/forgot-password" element={<RedirectIfSignedIn><AuthPage mode="forgot" /></RedirectIfSignedIn>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/change-password" element={<RequirePasswordChange><ChangePasswordPage /></RequirePasswordChange>} />

          <Route element={<SignedInApp />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/team" element={<TeamDirectoryView />} />
            <Route path="/profile" element={<EmployeeProfileView />} />
            <Route path="/salary/slips" element={<EmployeeSalarySlipsView />} />

            <Route element={<RequireRole roles={['admin', 'manager']} />}>
              <Route path="/employees" element={<EmployeesView />} />
              <Route path="/employees/:id" element={<EmployeesView />} />
              <Route path="/invoices" element={<InvoicesView />} />
              <Route path="/invoices/:id" element={<InvoicesView />} />
              <Route path="/reports" element={<ReportsView />} />
            </Route>

            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="/accounting" element={<AccountingView />} />
              <Route path="/salary" element={<SalaryView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/settings/users" element={<SettingsView />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
