import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { AuditLog } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { UsersPanel } from './UsersPanel';
import {
  Settings as SettingsIcon,
  Building2,
  ShieldCheck,
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  Clock,
  ArrowRight,
  ShieldAlert,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { formatDate, exportToCSV } from '../../utils/formatters';

type SettingsTab = 'general' | 'audit' | 'users';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    currentUser,
    auditLogs,
    activityLogs,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Form states
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyEmail, setCompanyEmail] = useState(settings.companyEmail);
  const [companyPhone, setCompanyPhone] = useState(settings.companyPhone);
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
  const [companyGstin, setCompanyGstin] = useState(settings.companyGstin || '');
  const [defaultCurrency, setDefaultCurrency] = useState(settings.defaultCurrency);
  const [financialYearStartMonth, setFinancialYearStartMonth] = useState(
    settings.financialYearStartMonth
  );
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);
  const [taxRatePercentage, setTaxRatePercentage] = useState(settings.taxRatePercentage);
  const [companyTimezone, setCompanyTimezone] = useState(settings.companyTimezone || 'Asia/Kolkata');
  const [workStartTime, setWorkStartTime] = useState(settings.workStartTime || '09:30');
  const [workEndTime, setWorkEndTime] = useState(settings.workEndTime || '18:30');
  const [expectedDailyHours, setExpectedDailyHours] = useState(settings.expectedDailyHours || 8.0);
  const [weeklyWorkingDays, setWeeklyWorkingDays] = useState(settings.weeklyWorkingDays || 5);

  // Audit Logs inspection modal state
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Audit log table filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      ...settings,
      companyName: companyName.trim(),
      companyEmail: companyEmail.trim(),
      companyPhone: companyPhone.trim(),
      companyAddress: companyAddress.trim(),
      companyGstin: companyGstin.trim(),
      defaultCurrency,
      financialYearStartMonth,
      invoicePrefix: invoicePrefix.trim(),
      taxRatePercentage: Number(taxRatePercentage) || 18,
      companyTimezone,
      workStartTime,
      workEndTime,
      expectedDailyHours: Number(expectedDailyHours) || 8.0,
      weeklyWorkingDays: Number(weeklyWorkingDays) || 5,
    });
    showToast('success', 'Company profile and schedule policies updated successfully');
  };

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (auditEntityFilter !== 'all' && log.entityType !== auditEntityFilter) return false;
      if (auditActionFilter !== 'all' && log.action !== auditActionFilter) return false;
      if (auditSearch.trim()) {
        const query = auditSearch.toLowerCase();
        const matchesUser = log.userName.toLowerCase().includes(query);
        const matchesAction = log.action.toLowerCase().includes(query);
        const matchesDetails = log.details.toLowerCase().includes(query);
        const matchesEntity = (log.entityId || '').toLowerCase().includes(query);
        if (!matchesUser && !matchesAction && !matchesDetails && !matchesEntity) return false;
      }
      return true;
    });
  }, [auditLogs, auditEntityFilter, auditActionFilter, auditSearch]);

  // Distinct actions for filter dropdown
  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach(l => set.add(l.action));
    return Array.from(set).sort();
  }, [auditLogs]);

  // Export audit logs to CSV
  const handleExportAuditCSV = () => {
    const headers = [
      'Log ID',
      'Timestamp (UTC)',
      'Actor Name',
      'Actor Role',
      'Actor Email',
      'Action Type',
      'Entity Type',
      'Entity ID',
      'Details',
      'IP Address / Station',
      'Previous State (JSON)',
      'New State (JSON)',
    ];

    const rows = filteredAuditLogs.map(log => [
      log.id,
      log.timestamp,
      log.userName,
      log.userRole.toUpperCase(),
      log.userEmail || '',
      log.action,
      log.entityType,
      log.entityId || '',
      log.details,
      log.ipAddress || '',
      log.previousState ? JSON.stringify(log.previousState) : '',
      log.newState ? JSON.stringify(log.newState) : '',
    ]);

    exportToCSV(`audit_trail_${new Date().toISOString().split('T')[0]}_hybridmonks`, headers, rows);
    showToast('success', 'Exported audit trail to CSV file');
  };

  // Helper function to render action badge variants
  const getActionBadgeVariant = (action: string): 'purple' | 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
    if (action.includes('SALARY') || action.includes('Salary')) return 'purple';
    if (action.includes('ATTENDANCE') || action.includes('Attendance')) return 'warning';
    if (action.includes('PAYMENT') || action.includes('Payment') || action.includes('Paid')) return 'success';
    if (action.includes('DELETED') || action.includes('DEACTIVATED')) return 'error';
    return 'info';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Company & System Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Configure organization policies, audit accountability trails, and user access
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white border border-[#DFE6F1] rounded-lg shadow-xs self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'bg-[#5038F5] text-white shadow-xs'
                : 'text-[#7185A5] hover:text-[#111827]'
            }`}
          >
            General & Shifts
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-[#5038F5] text-white shadow-xs'
                : 'text-[#7185A5] hover:text-[#111827]'
            }`}
          >
            Audit Trail
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'audit' ? 'bg-white/20 text-white' : 'bg-[#5038F5]/10 text-[#5038F5]'
              }`}
            >
              {auditLogs.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#5038F5] text-white shadow-xs'
                : 'text-[#7185A5] hover:text-[#111827]'
            }`}
          >
            Users
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: GENERAL & SHIFT SETTINGS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card padding="md">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-[#5038F5]" />
                Company Profile & Legal Details
              </h3>

              <form onSubmit={handleSaveCompany} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      Company Email
                    </label>
                    <input
                      type="email"
                      value={companyEmail}
                      onChange={e => setCompanyEmail(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      Support / Office Phone
                    </label>
                    <input
                      type="text"
                      value={companyPhone}
                      onChange={e => setCompanyPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      GSTIN / Tax Identification
                    </label>
                    <input
                      type="text"
                      value={companyGstin}
                      onChange={e => setCompanyGstin(e.target.value)}
                      className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Registered Office Address
                  </label>
                  <textarea
                    rows={2}
                    value={companyAddress}
                    onChange={e => setCompanyAddress(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>

                {/* Accounting Parameters */}
                <div className="pt-3 border-t border-[#DFE6F1]">
                  <h4 className="text-xs font-bold text-[#111827] mb-3">
                    Financial & Currency Rules
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Default Currency
                      </label>
                      <select
                        value={defaultCurrency}
                        onChange={e => setDefaultCurrency(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      >
                        <option value="INR">INR (₹ - Indian Rupee)</option>
                        <option value="USD">USD ($ - US Dollar)</option>
                        <option value="EUR">EUR (€ - Euro)</option>
                        <option value="GBP">GBP (£ - British Pound)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        FY Start Month
                      </label>
                      <select
                        value={financialYearStartMonth}
                        onChange={e => setFinancialYearStartMonth(Number(e.target.value))}
                        className="w-full text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      >
                        <option value={4}>April (India FY)</option>
                        <option value={1}>January (Calendar)</option>
                        <option value={7}>July</option>
                        <option value={10}>October</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Invoice Prefix
                      </label>
                      <input
                        type="text"
                        value={invoicePrefix}
                        onChange={e => setInvoicePrefix(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Default GST Tax (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={taxRatePercentage}
                        onChange={e => setTaxRatePercentage(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      />
                    </div>
                  </div>
                </div>

                {/* Work Hours & Attendance Configuration */}
                <div className="pt-3 border-t border-[#DFE6F1]">
                  <h4 className="text-xs font-bold text-[#111827] mb-3">
                    Work Hours & Attendance Schedule
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Timezone
                      </label>
                      <select
                        value={companyTimezone}
                        onChange={e => setCompanyTimezone(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+5:30)</option>
                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                        <option value="America/New_York">America/New_York (EST)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Work Start Time
                      </label>
                      <input
                        type="time"
                        value={workStartTime}
                        onChange={e => setWorkStartTime(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Work End Time
                      </label>
                      <input
                        type="time"
                        value={workEndTime}
                        onChange={e => setWorkEndTime(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                        Daily Expected Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="4"
                        max="12"
                        value={expectedDailyHours}
                        onChange={e => setExpectedDailyHours(parseFloat(e.target.value) || 8)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="primary" size="md">
                    Save Changes
                  </Button>
                </div>
              </form>
            </Card>

          </div>

          {/* Right Column: Mini Audit Feed & Signed-in User */}
          <div className="space-y-6">
            <Card padding="md">
              <div className="flex items-center justify-between pb-3 border-b border-[#DFE6F1] mb-3">
                <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#5038F5]" />
                  Recent Audit Actions
                </h3>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="text-xs font-semibold text-[#5038F5] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View All ({auditLogs.length}) <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {auditLogs.slice(0, 5).map(log => (
                  <div
                    key={log.id}
                    onClick={() => {
                      setSelectedAuditLog(log);
                      setActiveTab('audit');
                    }}
                    className="p-2.5 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] hover:border-[#5038F5] transition-colors cursor-pointer text-xs"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <Badge variant={getActionBadgeVariant(log.action)} size="sm">
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-[10px] text-[#7185A5]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#111827] font-medium line-clamp-2">
                      {log.details}
                    </p>
                    <div className="text-[10px] text-[#7185A5] mt-1 flex items-center justify-between">
                      <span>By: {log.userName}</span>
                      <span className="font-mono text-[9px] text-[#5038F5] hover:underline">
                        Inspect Diff &rarr;
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Signed-in user */}
            <Card padding="md">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-[#5038F5]" />
                Signed-in Account
              </h3>
              <p className="text-xs text-[#7185A5] mb-3">
                You are signed in as:
              </p>
              <div className="p-2.5 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#111827] block">{currentUser.name}</span>
                  <span className="text-[10px] text-[#7185A5]">{currentUser.designation}</span>
                </div>
                <Badge variant="purple" size="sm">
                  {currentUser.role.toUpperCase()}
                </Badge>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: AUDIT LOGS & ACCOUNTABILITY CONSOLE */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Summary KPIs for Audit Trail */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card padding="sm">
              <span className="text-xs font-semibold text-[#7185A5]">Total Audit Events</span>
              <div className="text-2xl font-mono font-bold text-[#111827] mt-1">
                {auditLogs.length}
              </div>
              <p className="text-[11px] text-[#7185A5] mt-0.5">Chronological record count</p>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-[#7185A5]">Salary Disbursements</span>
              <div className="text-2xl font-mono font-bold text-[#5038F5] mt-1">
                {auditLogs.filter(l => l.action.includes('SALARY') || l.entityType === 'salary').length}
              </div>
              <p className="text-[11px] text-[#7185A5] mt-0.5">Logged payroll mutations</p>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-[#7185A5]">Attendance Corrections</span>
              <div className="text-2xl font-mono font-bold text-[#B45309] mt-1">
                {auditLogs.filter(l => l.action.includes('ATTENDANCE') || l.entityType === 'attendance').length}
              </div>
              <p className="text-[11px] text-[#7185A5] mt-0.5">Manual supervisor adjustments</p>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-[#7185A5]">Invoicing & Ledger</span>
              <div className="text-2xl font-mono font-bold text-[#047857] mt-1">
                {auditLogs.filter(l => l.entityType === 'invoice' || l.entityType === 'transaction').length}
              </div>
              <p className="text-[11px] text-[#7185A5] mt-0.5">Payment receipts & billing</p>
            </Card>
          </div>

          {/* Filter & Action Strip */}
          <Card padding="sm">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by actor, employee, description, or entity ID..."
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>

                {/* Entity Filter */}
                <select
                  value={auditEntityFilter}
                  onChange={e => setAuditEntityFilter(e.target.value)}
                  className="text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                >
                  <option value="all">All Modules</option>
                  <option value="salary">Salary & Payroll</option>
                  <option value="attendance">Attendance & Clock</option>
                  <option value="invoice">Invoices & Billing</option>
                  <option value="employee">Employees Roster</option>
                  <option value="settings">System Settings</option>
                </select>

                {/* Action Filter */}
                <select
                  value={auditActionFilter}
                  onChange={e => setAuditActionFilter(e.target.value)}
                  className="text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                >
                  <option value="all">All Action Types</option>
                  {distinctActions.map(action => (
                    <option key={action} value={action}>
                      {action.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportAuditCSV}
                >
                  Export Audit Trail (CSV)
                </Button>
              </div>
            </div>
          </Card>

          {/* Audit Logs Table */}
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[11px] font-semibold text-[#7185A5]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor / User</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target Entity</th>
                    <th className="px-4 py-3">Audit Details</th>
                    <th className="px-4 py-3 text-right">State Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#7185A5]">
                        No audit records match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-[#F7F9FC]/75 transition-colors">
                        {/* Timestamp */}
                        <td className="px-4 py-3 whitespace-nowrap text-[#7185A5]">
                          <div className="font-mono text-[#111827] font-medium">
                            {formatDate(log.timestamp.split('T')[0])}
                          </div>
                          <div className="text-[10px] text-[#7185A5]">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        </td>

                        {/* Actor */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center font-bold text-[10px] shrink-0">
                              {log.userName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-[#111827] block truncate">
                                {log.userName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge
                                  variant={
                                    log.userRole === 'admin'
                                      ? 'purple'
                                      : log.userRole === 'manager'
                                      ? 'info'
                                      : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {log.userRole.toUpperCase()}
                                </Badge>
                                {log.userEmail && (
                                  <span className="text-[10px] text-[#7185A5] truncate hidden sm:inline">
                                    {log.userEmail}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={getActionBadgeVariant(log.action)} size="sm">
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </td>

                        {/* Target Entity */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="capitalize font-medium text-[#111827] block">
                            {log.entityType}
                          </span>
                          {log.entityId && (
                            <span className="font-mono text-[10px] text-[#7185A5]">
                              {log.entityId}
                            </span>
                          )}
                        </td>

                        {/* Details */}
                        <td className="px-4 py-3 max-w-md">
                          <p className="text-xs text-[#111827] line-clamp-2">
                            {log.details}
                          </p>
                        </td>

                        {/* State Diff Trigger */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Eye className="w-3.5 h-3.5" />}
                            onClick={() => setSelectedAuditLog(log)}
                          >
                            Inspect Diff
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: USERS (accounts, roles, credentials) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'users' && <UsersPanel />}

      {/* ---------------------------------------------------- */}
      {/* AUDIT DIFF & ACCOUNTABILITY INSPECTION MODAL */}
      {/* ---------------------------------------------------- */}
      {selectedAuditLog && (
        <Modal
          isOpen={!!selectedAuditLog}
          onClose={() => setSelectedAuditLog(null)}
          title={`Audit Log Record: ${selectedAuditLog.id}`}
          description={`Logged action on ${formatDate(selectedAuditLog.timestamp.split('T')[0])} at ${new Date(selectedAuditLog.timestamp).toLocaleTimeString()}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Actor Attribution Header */}
            <div className="p-3 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-[#7185A5] block">Actor</span>
                <span className="font-semibold text-[#111827]">{selectedAuditLog.userName}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#7185A5] block">Role Privilege</span>
                <Badge
                  variant={
                    selectedAuditLog.userRole === 'admin'
                      ? 'purple'
                      : selectedAuditLog.userRole === 'manager'
                      ? 'info'
                      : 'neutral'
                  }
                  size="sm"
                >
                  {selectedAuditLog.userRole.toUpperCase()}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] text-[#7185A5] block">Action Type</span>
                <Badge variant={getActionBadgeVariant(selectedAuditLog.action)} size="sm">
                  {selectedAuditLog.action.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] text-[#7185A5] block">Network Station</span>
                <span className="font-mono text-[11px] text-[#475569]">
                  {selectedAuditLog.ipAddress || 'Internal Console'}
                </span>
              </div>
            </div>

            {/* Description Summary */}
            <div className="p-3 rounded-xl bg-white border border-[#DFE6F1]">
              <span className="text-[11px] font-semibold text-[#7185A5] block mb-1">
                Summary Details:
              </span>
              <p className="text-xs text-[#111827] leading-relaxed">
                {selectedAuditLog.details}
              </p>
              {selectedAuditLog.entityId && (
                <div className="mt-2 text-[11px] text-[#7185A5] flex items-center gap-1.5 font-mono">
                  <span>Target Identifier:</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#F7F9FC] border border-[#DFE6F1] text-[#111827]">
                    {selectedAuditLog.entityId}
                  </span>
                </div>
              )}
            </div>

            {/* State Diff Comparison: Previous State vs New State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Previous State */}
              <div className="p-3 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#7185A5] pb-2 border-b border-[#DFE6F1] mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Previous Record State (Before Mutation)
                </div>
                {selectedAuditLog.previousState && Object.keys(selectedAuditLog.previousState).length > 0 ? (
                  <pre className="text-[11px] font-mono text-[#475569] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                    {JSON.stringify(selectedAuditLog.previousState, null, 2)}
                  </pre>
                ) : (
                  <div className="py-6 text-center text-xs text-[#7185A5] italic">
                    No prior state (Initial record creation or automated action).
                  </div>
                )}
              </div>

              {/* New State */}
              <div className="p-3 rounded-xl bg-[#5038F5]/5 border border-[#5038F5]/20">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#5038F5] pb-2 border-b border-[#5038F5]/20 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  New Record State (After Action)
                </div>
                {selectedAuditLog.newState && Object.keys(selectedAuditLog.newState).length > 0 ? (
                  <pre className="text-[11px] font-mono text-[#111827] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                    {JSON.stringify(selectedAuditLog.newState, null, 2)}
                  </pre>
                ) : (
                  <div className="py-6 text-center text-xs text-[#7185A5] italic">
                    Record deleted or cleared.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedAuditLog(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
