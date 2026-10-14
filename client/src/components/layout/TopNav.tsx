import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Bell,
  Plus,
  Menu,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface TopNavProps {
  onMobileMenuToggle: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onMobileMenuToggle,
  searchQuery,
  setSearchQuery,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    currentUser,
    invoices,
    salaries,
    transactions,
    settings,
    setIsAddTransactionOpen,
    setIsAddInvoiceOpen,
    setIsAddEmployeeOpen,
  } = useApp();

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Derive real notifications from active system state
  const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
  const pendingSalaries = salaries.filter(s => s.status === 'Pending');
  const recentTransactions = transactions.slice(0, 3);

  const notificationCount = overdueInvoices.length + (currentUser.role === 'admin' ? pendingSalaries.length : 0);

  // Context-aware Quick Action button
  const renderQuickAction = () => {
    // Employee: punch-in is automatic at sign-in; punch-out lives on the dashboard and attendance page.
    if (currentUser.role === 'employee') {
      if (pathname.startsWith('/my/attendance')) return null;
      return (
        <Button variant="outline" size="sm" icon={<Clock className="w-3.5 h-3.5" />} onClick={() => navigate('/my/attendance')}>
          My Attendance
        </Button>
      );
    }

    if (pathname.startsWith('/invoices')) {
      return (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddInvoiceOpen(true)}
        >
          Create Invoice
        </Button>
      );
    }

    if ((pathname.startsWith('/employees') || pathname === '/team') && currentUser.role === 'admin') {
      return (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            navigate('/employees');
            setIsAddEmployeeOpen(true);
          }}
        >
          Add Employee
        </Button>
      );
    }

    // Recording transactions is admin-only (accounting); other pages have no quick action.
    if (currentUser.role !== 'admin' || pathname.startsWith('/salary')) {
      return null;
    }

    // Default for Dashboard and Accounting
    return (
      <Button
        variant="primary"
        size="sm"
        icon={<Plus className="w-4 h-4" />}
        onClick={() => {
          navigate('/accounting');
          setIsAddTransactionOpen(true);
        }}
      >
        Add Transaction
      </Button>
    );
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#DFE6F1] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left zone: Mobile toggle & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          onClick={onMobileMenuToggle}
          className="p-2 text-[#7185A5] hover:text-[#111827] rounded-lg lg:hidden"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search transactions, invoices, team members..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#F7F9FC] text-sm text-[#111827] placeholder:text-[#7185A5] pl-9 pr-4 py-2 rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Right zone: Notifications, User preview, Quick action */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Functional Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 text-[#7185A5] hover:text-[#111827] hover:bg-[#F7F9FC] rounded-lg transition-colors cursor-pointer"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E11D48] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-[#DFE6F1] shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#DFE6F1]">
                <span className="text-xs font-semibold text-[#111827]">
                  Notifications ({notificationCount})
                </span>
                <span className="text-[11px] text-[#7185A5]">System alerts</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {overdueInvoices.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#E11D48]/5 border border-[#E11D48]/15 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[#E11D48]">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      {overdueInvoices.length} Overdue Invoices
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1">
                      {overdueInvoices.map(i => i.invoiceNumber).join(', ')} require follow-up.
                    </p>
                    <button
                      onClick={() => {
                        navigate('/invoices');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      View Invoices <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {currentUser.role === 'admin' && pendingSalaries.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#B45309]/5 border border-[#B45309]/15 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <Clock className="w-4 h-4 shrink-0" />
                      {pendingSalaries.length} Pending Salary Payouts
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1">
                      Salaries awaiting disbursement for current payroll cycle.
                    </p>
                    <button
                      onClick={() => {
                        navigate('/salary');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      Manage Salaries <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {notificationCount === 0 && (
                  <div className="py-6 text-center text-xs text-[#7185A5]">
                    <CheckCircle2 className="w-6 h-6 text-[#047857] mx-auto mb-1 opacity-80" />
                    All finances and salaries up to date!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User info & role badge (visible on tablet/desktop) */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#DFE6F1]">
          <div className="text-right">
            <div className="text-xs font-semibold text-[#111827] leading-none">
              {currentUser.name}
            </div>
            <div className="text-[10px] text-[#7185A5] mt-0.5">
              {currentUser.designation}
            </div>
          </div>
          <Badge
            variant={
              currentUser.role === 'admin'
                ? 'purple'
                : currentUser.role === 'manager'
                ? 'info'
                : 'neutral'
            }
            size="sm"
          >
            {currentUser.role.toUpperCase()}
          </Badge>
        </div>

        {/* Quick action button */}
        {renderQuickAction()}
      </div>
    </header>
  );
};
