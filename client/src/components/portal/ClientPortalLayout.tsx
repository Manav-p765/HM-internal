import React, { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Building2, FolderKanban, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Avatar } from '../common/Avatar';
import { PageLoading } from '../../routes/guards';

// Restricted shell for client (portal) users. It never mounts the staff AppProvider, so no staff data
// (invoices, salaries, employees...) is ever loaded in a client's browser.
const NAV = [
  { to: '/portal', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, end: true },
  { to: '/portal/projects', label: 'My Projects', icon: <FolderKanban className="w-4 h-4" />, end: false },
  { to: '/portal/profile', label: 'Company Profile', icon: <Building2 className="w-4 h-4" />, end: false },
];

export const ClientPortalLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const companyName = user?.clientName ?? 'Client';

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-[#DFE6F1] flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-[#DFE6F1] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5038F5] text-white flex items-center justify-center font-bold">M</div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[#111827] leading-none">Monks</span>
              <span className="text-[11px] text-[#7185A5] mt-0.5 leading-none">Client Portal</span>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 text-[#7185A5] lg:hidden" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold text-[#7185A5] uppercase tracking-wider truncate">{companyName}</div>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-[#5038F5]/10 text-[#5038F5] font-semibold' : 'text-[#475569] hover:text-[#111827] hover:bg-[#F7F9FC]'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[#DFE6F1]">
          <div className="flex items-center gap-3 p-2">
            <Avatar name={user?.email ?? '?'} size="md" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#111827] truncate block">{user?.email}</span>
              <Badge variant="info" size="sm">
                CLIENT
              </Badge>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-2 w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-[#E11D48] hover:bg-[#E11D48]/10 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <header className="h-16 px-4 sm:px-8 bg-white border-b border-[#DFE6F1] flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 text-[#475569] lg:hidden" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-[#111827] truncate">{companyName}</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="px-6 py-4 border-t border-[#DFE6F1] bg-white text-xs text-[#7185A5]">
          &copy; 2026 Hybrid Monks. Client Portal.
        </footer>
      </div>
    </div>
  );
};
