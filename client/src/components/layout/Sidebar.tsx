import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { NavLink } from 'react-router';
import { UserRole } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  LayoutDashboard,
  WalletCards,
  ArrowLeftRight,
  FileText,
  Users,
  Banknote,
  BarChart3,
  Contact,
  Settings,
  Building2,
  LogOut,
  X,
  Clock,
  Receipt,
  User,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  CalendarDays,
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { COMPANY_BRAND } from '../../utils/company';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

function getNavItems(role: UserRole): NavItem[] {
  if (role === 'employee') {
    return [
      { to: '/dashboard', label: 'My Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { to: '/my/tasks', label: 'My Tasks', icon: <ListChecks className="w-4 h-4" /> },
      { to: '/my/projects', label: 'My Projects', icon: <FolderKanban className="w-4 h-4" /> },
      { to: '/my/attendance', label: 'My Attendance', icon: <Clock className="w-4 h-4" /> },
      { to: '/my/leaves', label: 'My Leaves', icon: <CalendarDays className="w-4 h-4" /> },
      { to: '/salary/slips', label: 'My Salary Slips', icon: <Receipt className="w-4 h-4" /> },
      { to: '/team', label: 'Team Directory', icon: <Contact className="w-4 h-4" /> },
      { to: '/profile', label: 'My Profile', icon: <User className="w-4 h-4" /> },
    ];
  }
  if (role === 'manager') {
    return [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { to: '/projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
      { to: '/tasks', label: 'Tasks', icon: <ListChecks className="w-4 h-4" /> },
      { to: '/employees', label: 'Employees', icon: <Users className="w-4 h-4" /> },
      { to: '/attendance', label: 'Attendance', icon: <Clock className="w-4 h-4" /> },
      { to: '/leaves', label: 'Leaves', icon: <CalendarDays className="w-4 h-4" /> },
      { to: '/team', label: 'Team Directory', icon: <Contact className="w-4 h-4" /> },
      { to: '/invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
      { to: '/clients', label: 'Clients', icon: <Building2 className="w-4 h-4" /> },
      { to: '/reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    ];
  }
  return [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { to: '/projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
    { to: '/tasks', label: 'Tasks', icon: <ListChecks className="w-4 h-4" /> },
    { to: '/accounting', label: 'Accounting', icon: <WalletCards className="w-4 h-4" /> },
    { to: '/invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
    { to: '/clients', label: 'Clients', icon: <Building2 className="w-4 h-4" /> },
    { to: '/employees', label: 'Employees', icon: <Users className="w-4 h-4" /> },
    { to: '/attendance', label: 'Attendance', icon: <Clock className="w-4 h-4" /> },
    { to: '/leaves', label: 'Leaves', icon: <CalendarDays className="w-4 h-4" /> },
    // 'end' so /salary/slips (own payslips) doesn't also light up Salary Management
    { to: '/salary', label: 'Salary Management', icon: <Banknote className="w-4 h-4" />, end: true },
    { to: '/reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    { to: '/team', label: 'Team Directory', icon: <Contact className="w-4 h-4" /> },
    { to: '/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
  const { currentUser } = useApp();
  const { logout } = useAuth();

  // Hiding items by role is cosmetic; RequireRole and the server are the real guards.
  const navItems = getNavItems(currentUser.role);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`no-print fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-[#DFE6F1] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Area */}
        <div className="h-16 px-5 border-b border-[#DFE6F1] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5038F5] text-white flex items-center justify-center font-bold text-base shadow-sm">
              M
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#111827] leading-none">
                Monks
              </span>
              <span className="text-[11px] font-medium text-[#7185A5] mt-0.5 leading-none">
                {COMPANY_BRAND}
              </span>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="p-1.5 text-[#7185A5] hover:text-[#111827] lg:hidden rounded-md"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold text-[#7185A5] uppercase tracking-wider flex items-center justify-between">
            <span>{currentUser.role === 'employee' ? 'My Workplace' : 'Main Menu'}</span>
            <span className="text-[9px] uppercase font-bold text-[#5038F5] bg-[#5038F5]/10 px-1.5 py-0.5 rounded">
              {currentUser.role}
            </span>
          </div>

          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#5038F5]/10 text-[#5038F5] font-semibold'
                    : 'text-[#475569] hover:text-[#111827] hover:bg-[#F7F9FC]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-[#5038F5]' : 'text-[#7185A5]'}>{item.icon}</span>
                  <span className="truncate flex-1">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Signed-in user */}
        <div className="p-3 border-t border-[#DFE6F1] bg-[#F7F9FC]/40 relative">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <Avatar name={currentUser.name} url={currentUser.avatarUrl} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-[#111827] truncate">
                  {currentUser.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
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
            </div>
          </div>

          {/* Logout Action */}
          <div className="mt-2 pt-2 border-t border-[#DFE6F1]">
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-[#E11D48] hover:bg-[#E11D48]/10 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
