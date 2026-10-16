import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { UsersPanel } from './UsersPanel';
import { CompanySettingsPanel } from './CompanySettingsPanel';
import { ShieldCheck } from 'lucide-react';

type SettingsTab = 'company' | 'users';

// /settings (admin): company settings (server: /api/settings/company) and /settings/users (accounts, roles,
// credentials). The audit trail is recorded on the server (audit_logs); a viewer for it is planned for v2.
export const SettingsView: React.FC = () => {
  const { currentUser } = useApp();
  // /settings/users is its own route; Company is the /settings page.
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTab: SettingsTab = pathname === '/settings/users' ? 'users' : 'company';
  const setActiveTab = (tab: SettingsTab) =>
    navigate(tab === 'users' ? '/settings/users' : '/settings');

  const tabClass = (tab: SettingsTab) =>
    `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
      activeTab === tab ? 'bg-[#5038F5] text-white shadow-xs' : 'text-[#7185A5] hover:text-[#111827]'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Company & System Settings</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Company details for invoices, and user access</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg shadow-xs self-start sm:self-auto">
          <button onClick={() => setActiveTab('company')} className={tabClass('company')}>
            Company
          </button>
          <button onClick={() => setActiveTab('users')} className={tabClass('users')}>
            Users
          </button>
        </div>
      </div>

      {activeTab === 'company' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CompanySettingsPanel />
          </div>
          <div className="space-y-6">
            <Card padding="md">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-[#5038F5]" />
                Signed-in Account
              </h3>
              <p className="text-xs text-[#7185A5] mb-3">You are signed in as:</p>
              <div className="p-2.5 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#111827] block">{currentUser.name}</span>
                  <span className="text-[10px] text-[#7185A5]">{currentUser.designation}</span>
                </div>
                <Badge variant="purple" size="sm">
                  {currentUser.role.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[11px] text-[#7185A5] mt-3">
                Every change is recorded in the server's audit log. A viewer for it is planned for a later release.
              </p>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'users' && <UsersPanel />}
    </div>
  );
};
