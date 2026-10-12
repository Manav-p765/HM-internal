/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { ToastContainer } from './components/common/ToastContainer';
import { DashboardView } from './components/dashboard/DashboardView';
import { AccountingView } from './components/accounting/AccountingView';
import { InvoicesView } from './components/invoices/InvoicesView';
import { EmployeesView } from './components/employees/EmployeesView';
import { SalaryView } from './components/salary/SalaryView';
import { ReportsView } from './components/reports/ReportsView';
import { TeamDirectoryView } from './components/directory/TeamDirectoryView';
import { SettingsView } from './components/settings/SettingsView';
import { AdminAttendanceView } from './components/attendance/AdminAttendanceView';
import { EmployeeAttendanceView } from './components/attendance/EmployeeAttendanceView';
import { EmployeeDashboardView } from './components/dashboard/EmployeeDashboardView';
import { EmployeeSalarySlipsView } from './components/salary/EmployeeSalarySlipsView';
import { EmployeeProfileView } from './components/profile/EmployeeProfileView';
import { AuthPage } from './components/auth/AuthPage';
import { ShieldAlert } from 'lucide-react';
import { Button } from './components/common/Button';

const MainLayout: React.FC = () => {
  const { activeTab, setActiveTab, currentUser } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Role permission guards and content view routing
  const renderContent = () => {
    // 1. Confidential Accounting & Financials: Admin only
    if (activeTab === 'accounting' && currentUser.role !== 'admin') {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-[#DFE6F1]">
          <div className="w-12 h-12 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#111827]">Access Restricted</h2>
          <p className="text-xs text-[#7185A5] max-w-sm mt-1 mb-4">
            Company financial ledger, transaction tracking, and accounts are restricted to executive administrators.
          </p>
          <Button variant="primary" size="sm" onClick={() => setActiveTab(currentUser.role === 'employee' ? 'my_dashboard' : 'dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      );
    }

    // 2. Salary & Payroll management: Admin only
    if (activeTab === 'salary' && currentUser.role !== 'admin') {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-[#DFE6F1]">
          <div className="w-12 h-12 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#111827]">Access Restricted</h2>
          <p className="text-xs text-[#7185A5] max-w-sm mt-1 mb-4">
            Confidential company payroll, adjustments, and disbursement records are restricted to executive administrators.
          </p>
          <Button variant="primary" size="sm" onClick={() => setActiveTab(currentUser.role === 'employee' ? 'my_dashboard' : 'dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      );
    }

    // 3. Organization Settings: Admin only
    if (activeTab === 'settings' && currentUser.role !== 'admin') {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-[#DFE6F1]">
          <div className="w-12 h-12 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#111827]">Admin Privileges Required</h2>
          <p className="text-xs text-[#7185A5] max-w-sm mt-1 mb-4">
            Company organization profiles, tax settings, and work policies are restricted to Admin users.
          </p>
          <Button variant="primary" size="sm" onClick={() => setActiveTab(currentUser.role === 'employee' ? 'my_dashboard' : 'dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      );
    }

    // 4. Invoices / Employees / Reports: Guard against Employee role
    if ((activeTab === 'invoices' || activeTab === 'employees' || activeTab === 'reports') && currentUser.role === 'employee') {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-[#DFE6F1]">
          <div className="w-12 h-12 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#111827]">Management Portal Only</h2>
          <p className="text-xs text-[#7185A5] max-w-sm mt-1 mb-4">
            This module is reserved for management and administrative team leads. Please use your personal employee workspace.
          </p>
          <Button variant="primary" size="sm" onClick={() => setActiveTab('my_dashboard')}>
            Open My Dashboard
          </Button>
        </div>
      );
    }

    // Route views by tab
    switch (activeTab) {
      // Admin & Manager Views
      case 'dashboard':
        return currentUser.role === 'employee' ? <EmployeeDashboardView /> : <DashboardView />;
      case 'accounting':
        return <AccountingView />;
      case 'invoices':
        return <InvoicesView />;
      case 'employees':
        return <EmployeesView />;
      case 'attendance':
        return currentUser.role === 'employee' ? <EmployeeAttendanceView /> : <AdminAttendanceView />;
      case 'salary':
        return <SalaryView />;
      case 'reports':
        return <ReportsView />;
      case 'directory':
        return <TeamDirectoryView />;
      case 'settings':
        return <SettingsView />;

      // Employee Personal Views
      case 'my_dashboard':
        return <EmployeeDashboardView />;
      case 'my_attendance':
        return <EmployeeAttendanceView />;
      case 'my_salary_slips':
        return <EmployeeSalarySlipsView />;
      case 'my_profile':
        return <EmployeeProfileView />;

      default:
        return currentUser.role === 'employee' ? <EmployeeDashboardView /> : <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      {/* Left Sidebar */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navigation */}
        <TopNav
          onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          searchQuery={globalSearch}
          setSearchQuery={setGlobalSearch}
        />

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderContent()}
        </main>

        {/* Global Footer */}
        <footer className="px-6 py-4 border-t border-[#DFE6F1] bg-white text-xs text-[#7185A5] flex flex-col sm:flex-row items-center justify-between gap-2 no-print">
          <div>
            &copy; 2026 Hybrid Monks. Monks Internal Management System.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Confidential Internal Portal</span>
            <span>·</span>
            <span className="font-mono">v1.2.0-prod</span>
          </div>
        </footer>
      </div>

      {/* Floating Toast Notification System */}
      <ToastContainer />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { session } = useApp();

  if (!session) {
    return (
      <>
        <AuthPage />
        <ToastContainer />
      </>
    );
  }

  return <MainLayout />;
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
