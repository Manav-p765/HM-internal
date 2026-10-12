import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ActiveTab } from '../../types';
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
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    settings,
  } = useApp();
  const { logout } = useAuth();

  // Define navigation items based on Role
  const getNavItems = () => {
    // 1. EMPLOYEE: Strict 4-item navigation + Logout
    if (currentUser.role === 'employee') {
      return [
        {
          tab: 'my_dashboard' as ActiveTab,
          label: 'My Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          tab: 'my_attendance' as ActiveTab,
          label: 'My Attendance',
          icon: <Clock className="w-4 h-4" />,
        },
        {
          tab: 'my_salary_slips' as ActiveTab,
          label: 'My Salary Slips',
          icon: <Receipt className="w-4 h-4" />,
        },
        {
          tab: 'my_profile' as ActiveTab,
          label: 'My Profile',
          icon: <User className="w-4 h-4" />,
        },
      ];
    }

    // 2. MANAGER: Operational dashboard, attendance, employees, directory, reports
    if (currentUser.role === 'manager') {
      return [
        {
          tab: 'dashboard' as ActiveTab,
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          tab: 'attendance' as ActiveTab,
          label: 'Attendance',
          icon: <Clock className="w-4 h-4" />,
        },
        {
          tab: 'employees' as ActiveTab,
          label: 'Employees',
          icon: <Users className="w-4 h-4" />,
        },
        {
          tab: 'directory' as ActiveTab,
          label: 'Team Directory',
          icon: <Contact className="w-4 h-4" />,
        },
        {
          tab: 'invoices' as ActiveTab,
          label: 'Invoices',
          icon: <FileText className="w-4 h-4" />,
        },
        {
          tab: 'reports' as ActiveTab,
          label: 'Reports',
          icon: <BarChart3 className="w-4 h-4" />,
        },
      ];
    }

    // 3. ADMIN: Full access to all 11 modules
    return [
      {
        tab: 'dashboard' as ActiveTab,
        label: 'Dashboard',
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        tab: 'accounting' as ActiveTab,
        label: 'Accounting',
        icon: <WalletCards className="w-4 h-4" />,
      },
      {
        tab: 'invoices' as ActiveTab,
        label: 'Invoices',
        icon: <FileText className="w-4 h-4" />,
      },
      {
        tab: 'employees' as ActiveTab,
        label: 'Employees',
        icon: <Users className="w-4 h-4" />,
      },
      {
        tab: 'attendance' as ActiveTab,
        label: 'Attendance',
        icon: <Clock className="w-4 h-4" />,
      },
      {
        tab: 'salary' as ActiveTab,
        label: 'Salary Management',
        icon: <Banknote className="w-4 h-4" />,
      },
      {
        tab: 'reports' as ActiveTab,
        label: 'Reports',
        icon: <BarChart3 className="w-4 h-4" />,
      },
      {
        tab: 'directory' as ActiveTab,
        label: 'Team Directory',
        icon: <Contact className="w-4 h-4" />,
      },
      {
        tab: 'settings' as ActiveTab,
        label: 'Settings',
        icon: <Settings className="w-4 h-4" />,
      },
    ];
  };

  const navItems = getNavItems();

  const handleNavClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    onMobileClose();
  };

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
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-[#DFE6F1] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
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
                {settings.companyName}
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

          {navItems.map(item => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.tab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#5038F5]/10 text-[#5038F5] font-semibold'
                    : 'text-[#475569] hover:text-[#111827] hover:bg-[#F7F9FC]'
                }`}
              >
                <span className={isActive ? 'text-[#5038F5]' : 'text-[#7185A5]'}>
                  {item.icon}
                </span>
                <span className="truncate flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Signed-in user */}
        <div className="p-3 border-t border-[#DFE6F1] bg-[#F7F9FC]/40 relative">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[#5038F5]/10 border border-[#DFE6F1] shrink-0">
              {currentUser.avatarUrl && (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span className="w-full h-full flex items-center justify-center text-xs font-bold text-[#5038F5]">
                {currentUser.name.charAt(0)}
              </span>
            </div>
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
