import React from 'react';
import { useSearchParams } from 'react-router';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { COMPANY_BRAND } from '../../utils/company';
import { OperationsDashboard } from './OperationsDashboard';
import { FinanceOverview } from './FinanceOverview';

// Staff dashboard (admin and manager; employees have EmployeeDashboardView).
//   manager: the operational dashboard only. No money: no invoice, ledger, salary or report cards, and the
//            browser never calls those APIs (the server refuses them with 403 anyway).
//   admin:   two tabs on one page, Overview (finance) and Operations (the same component managers see).
//            The tab is in the URL (?tab=operations) so it survives a reload and can be linked.
export type DashboardTab = 'overview' | 'operations';

export function dashboardTabsFor(role: UserRole): DashboardTab[] {
  return role === 'admin' ? ['overview', 'operations'] : ['operations'];
}

const TAB_LABEL: Record<DashboardTab, string> = { overview: 'Overview', operations: 'Operations' };

export const DashboardView: React.FC = () => {
  const { currentUser } = useApp();
  const [params, setParams] = useSearchParams();
  const tabs = dashboardTabsFor(currentUser.role);
  const requested = params.get('tab') as DashboardTab | null;
  const tab: DashboardTab = requested && tabs.includes(requested) ? requested : tabs[0];
  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            {isAdmin ? 'Dashboard' : 'Operational Dashboard'}
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5" data-testid="dashboard-subtitle">
            {isAdmin
              ? `Finances, payroll and day-to-day operations for ${COMPANY_BRAND}`
              : 'Team attendance and operations overview'}
          </p>
        </div>

        {tabs.length > 1 && (
          <div role="tablist" aria-label="Dashboard" className="flex items-center gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg shadow-xs self-start sm:self-auto">
            {tabs.map(id => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                data-testid={`dashboard-tab-${id}`}
                onClick={() => setParams(id === tabs[0] ? {} : { tab: id }, { replace: true })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tab === id ? 'bg-[#5038F5] text-white shadow-xs' : 'text-[#7185A5] hover:text-[#111827]'
                }`}
              >
                {TAB_LABEL[id]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'overview' && isAdmin ? <FinanceOverview /> : <OperationsDashboard />}
    </div>
  );
};
