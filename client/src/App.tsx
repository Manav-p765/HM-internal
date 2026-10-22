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
import { SetPasswordPage } from './components/auth/SetPasswordPage';
import { ChangePasswordPage } from './components/auth/ChangePasswordPage';
import {
  PageLoading,
  RedirectIfSignedIn,
  RequireAuth,
  RequireClient,
  RequirePasswordChange,
  RequireRole,
  RequireStaff,
} from './routes/guards';
import { ClientPortalLayout } from './components/portal/ClientPortalLayout';
import { usePresence } from './api/usePresence';
import { TaskLinkPage } from './routes/TaskLinkPage';

// Pages are split into their own chunks and loaded on first visit.
const named = <T, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(() => load().then(module => ({ default: module[name] as React.ComponentType })));

const DashboardView = named(() => import('./components/dashboard/DashboardView'), 'DashboardView');
const EmployeeDashboardView = named(() => import('./components/dashboard/EmployeeDashboardView'), 'EmployeeDashboardView');
const AccountingView = named(() => import('./components/accounting/AccountingView'), 'AccountingView');
const InvoicesView = named(() => import('./components/invoices/InvoicesView'), 'InvoicesView');
const InvoicePrintView = named(() => import('./components/invoices/InvoicePrintView'), 'InvoicePrintView');
const EmployeesView = named(() => import('./components/employees/EmployeesView'), 'EmployeesView');
const SalaryView = named(() => import('./components/salary/SalaryView'), 'SalaryView');
const EmployeeSalarySlipsView = named(() => import('./components/salary/EmployeeSalarySlipsView'), 'EmployeeSalarySlipsView');
const PayslipPrintView = named(() => import('./components/salary/PayslipPrintView'), 'PayslipPrintView');
const ReportsView = named(() => import('./components/reports/ReportsView'), 'ReportsView');
const TeamDirectoryView = named(() => import('./components/directory/TeamDirectoryView'), 'TeamDirectoryView');
const SettingsView = named(() => import('./components/settings/SettingsView'), 'SettingsView');
const EmployeeProfileView = named(() => import('./components/profile/EmployeeProfileView'), 'EmployeeProfileView');
const ClientsView = named(() => import('./components/clients/ClientsView'), 'ClientsView');
const ProjectsView = named(() => import('./components/projects/ProjectsView'), 'ProjectsView');
const EmployeeProjectsView = named(() => import('./components/projects/ProjectsView'), 'EmployeeProjectsView');
const TasksView = named(() => import('./components/tasks/TasksView'), 'TasksView');
const EmployeeTasksView = named(() => import('./components/tasks/TasksView'), 'EmployeeTasksView');
const PortalProjectsView = named(() => import('./components/portal/PortalProjectsView'), 'PortalProjectsView');
const PortalProjectTasksView = named(() => import('./components/portal/PortalProjectsView'), 'PortalProjectTasksView');
const ClientPortalDashboard = named(() => import('./components/portal/ClientPortalDashboard'), 'ClientPortalDashboard');
const ClientPortalProfile = named(() => import('./components/portal/ClientPortalProfile'), 'ClientPortalProfile');
const PortalTeamView = named(() => import('./components/portal/PortalTeamView'), 'PortalTeamView');
const PortalInvoicesView = named(() => import('./components/portal/PortalInvoicesView'), 'PortalInvoicesView');
const PortalInvoiceView = named(() => import('./components/portal/PortalInvoicesView'), 'PortalInvoiceView');
const AdminAttendanceView = named(() => import('./components/attendance/AdminAttendanceView'), 'AdminAttendanceView');
const EmployeeAttendanceView = named(() => import('./components/attendance/EmployeeAttendanceView'), 'EmployeeAttendanceView');
const LeaveManagementView = named(() => import('./components/leaves/LeaveManagementView'), 'LeaveManagementView');
const EmployeeLeaveView = named(() => import('./components/leaves/EmployeeLeaveView'), 'EmployeeLeaveView');

// Dashboard differs by role: staff get their personal workspace.
const Dashboard: React.FC = () => {
  const { currentUser } = useApp();
  return currentUser.role === 'employee' ? <EmployeeDashboardView /> : <DashboardView />;
};

const MainLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const { currentUser } = useApp();
  // Presence heartbeats: employee-role users only, while the tab is visible.
  usePresence(currentUser.role === 'employee');

  return (
    <div className="min-h-screen bg-[#F7F9FC] print:bg-white flex">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 print:pl-0">
        <TopNav
          onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          searchQuery={globalSearch}
          setSearchQuery={setGlobalSearch}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
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

// The staff app. Keyed by user so nothing from a previous sign-in survives in memory.
// Client users never get here (RequireStaff sends them to the portal), so staff data is never loaded for them.
const SignedInApp: React.FC = () => {
  const { user } = useAuth();
  return (
    <RequireAuth>
      <RequireStaff>
        <AppProvider key={user?.id}>
          <MainLayout />
        </AppProvider>
      </RequireStaff>
    </RequireAuth>
  );
};

// The client portal shell.
const ClientPortal: React.FC = () => (
  <RequireAuth>
    <RequireClient>
      <ClientPortalLayout />
    </RequireClient>
  </RequireAuth>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfSignedIn><AuthPage mode="login" /></RedirectIfSignedIn>} />
          <Route path="/forgot-password" element={<RedirectIfSignedIn><AuthPage mode="forgot" /></RedirectIfSignedIn>} />
          {/* Emailed invite/reset links. Public (works signed in or out); /reset-password is the old reset link. */}
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/reset-password" element={<SetPasswordPage />} />
          <Route path="/change-password" element={<RequirePasswordChange><ChangePasswordPage /></RequirePasswordChange>} />

          {/* A shared task link: opens the task in the reader's own shell (staff app or client portal). */}
          <Route path="/task/:code" element={<RequireAuth><TaskLinkPage /></RequireAuth>} />

          <Route path="/portal" element={<ClientPortal />}>
            <Route index element={<ClientPortalDashboard />} />
            <Route path="projects" element={<PortalProjectsView />} />
            <Route path="projects/:id" element={<PortalProjectTasksView />} />
            <Route path="invoices" element={<PortalInvoicesView />} />
            <Route path="invoices/:id" element={<PortalInvoiceView />} />
            <Route path="team" element={<PortalTeamView />} />
            <Route path="profile" element={<ClientPortalProfile />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Route>

          <Route element={<SignedInApp />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/team" element={<TeamDirectoryView />} />
            <Route path="/profile" element={<EmployeeProfileView />} />
            {/* Own payslips: employees, and managers/admins linked to an employee (the server checks ownership). */}
            <Route path="/salary/slips" element={<EmployeeSalarySlipsView />} />
            <Route path="/salary/slips/:id" element={<EmployeeSalarySlipsView />} />
            <Route path="/salary/slips/:id/print" element={<PayslipPrintView />} />

            <Route element={<RequireRole roles={['admin', 'manager']} />}>
              <Route path="/employees" element={<EmployeesView />} />
              <Route path="/employees/:id" element={<EmployeesView />} />
              <Route path="/clients" element={<ClientsView />} />
              <Route path="/clients/:id" element={<ClientsView />} />
              <Route path="/projects" element={<ProjectsView />} />
              <Route path="/projects/:id" element={<ProjectsView />} />
              <Route path="/tasks" element={<TasksView />} />
              <Route path="/tasks/:id" element={<TasksView />} />
              <Route path="/attendance" element={<AdminAttendanceView />} />
              <Route path="/leaves" element={<LeaveManagementView />} />
            </Route>

            <Route element={<RequireRole roles={['employee']} />}>
              <Route path="/my/tasks" element={<EmployeeTasksView />} />
              <Route path="/my/tasks/:id" element={<EmployeeTasksView />} />
              <Route path="/my/projects" element={<EmployeeProjectsView />} />
              <Route path="/my/projects/:id" element={<EmployeeProjectsView />} />
              <Route path="/my/attendance" element={<EmployeeAttendanceView />} />
              <Route path="/my/leaves" element={<EmployeeLeaveView />} />
            </Route>

            <Route element={<RequireRole roles={['admin']} />}>
              {/* Money is admin only: managers get no invoices, reports, ledger or salaries. */}
              <Route path="/invoices" element={<InvoicesView />} />
              <Route path="/invoices/new" element={<InvoicesView />} />
              <Route path="/invoices/:id" element={<InvoicesView />} />
              <Route path="/invoices/:id/edit" element={<InvoicesView />} />
              <Route path="/invoices/:id/print" element={<InvoicePrintView />} />
              <Route path="/reports" element={<ReportsView />} />
              <Route path="/accounting" element={<AccountingView />} />
              <Route path="/accounting/new" element={<AccountingView />} />
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
