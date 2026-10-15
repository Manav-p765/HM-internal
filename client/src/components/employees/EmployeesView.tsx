import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApp } from '../../context/AppContext';
import { employeesApi } from '../../api/employees';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { DEPARTMENTS, EMPLOYMENT_STATUS_LABEL, Employee, EmploymentStatus } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { EmployeeModal } from './EmployeeModal';
import { EmployeeDetailModal } from './EmployeeDetailModal';
import { loginStatus, statusBadgeVariant } from './employeeDisplay';
import { Users, Plus, Search, Eye, Edit2, UserX, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatDateIst } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

const PAGE_SIZE = 50;

export const EmployeesView: React.FC = () => {
  const { currentUser, showToast, isAddEmployeeOpen, setIsAddEmployeeOpen } = useApp();
  const isAdmin = currentUser.role === 'admin';

  // Filters (search is debounced so typing doesn't fire a request per keystroke)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | EmploymentStatus>('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const list = useApiData(
    () =>
      employeesApi.list({
        search,
        department: departmentFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [search, departmentFilter, statusFilter, offset],
  );
  const employees = list.data?.employees ?? [];
  const summary = list.data?.summary;
  const total = list.data?.total ?? 0;

  // /employees/:id opens the detail modal (works as a direct link too).
  const { id: viewId } = useParams();
  const navigate = useNavigate();

  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [employeeToDeactivate, setEmployeeToDeactivate] = useState<Employee | null>(null);
  const [employeeToReactivate, setEmployeeToReactivate] = useState<Employee | null>(null);
  const [restoreLogin, setRestoreLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  const openAdd = () => {
    setEmployeeToEdit(null);
    setIsAddEmployeeOpen(true);
  };
  const openEdit = (employee: Employee) => {
    setEmployeeToEdit(employee);
    setIsAddEmployeeOpen(true);
  };

  const afterChange = (employee: Employee, message: string) => {
    showToast('success', message);
    list.reload();
    return employee;
  };

  const handleDeactivate = async () => {
    const target = employeeToDeactivate;
    if (!target) return;
    setEmployeeToDeactivate(null);
    setBusy(true);
    try {
      const updated = await employeesApi.deactivate(target.id);
      afterChange(
        updated,
        target.login ? `${target.fullName} deactivated and their login disabled` : `${target.fullName} deactivated`,
      );
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    const target = employeeToReactivate;
    if (!target) return;
    setEmployeeToReactivate(null);
    setBusy(true);
    try {
      const updated = await employeesApi.reactivate(target.id, restoreLogin);
      afterChange(
        updated,
        restoreLogin && target.login ? `${target.fullName} reactivated; their login works again` : `${target.fullName} reactivated`,
      );
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const hasFilters = Boolean(search || departmentFilter || statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Employee Management</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Internal workforce roster, designations, and compensation baselines
          </p>
        </div>

        {isAdmin && (
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>
            Add Employee
          </Button>
        )}
      </div>

      {/* KPI Cards (whole roster, not the filtered page) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">Total Team Roster</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#111827]">{summary?.total ?? '—'}</span>
            <span className="text-xs text-[#7185A5]">Total headcount</span>
          </div>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">Active Members</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#047857]">{summary?.active ?? '—'}</span>
            <span className="text-xs text-[#047857]">Working actively</span>
          </div>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">On Leave Today</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#B45309]">{summary?.onLeaveToday ?? '—'}</span>
            <span className="text-xs text-[#B45309]">Approved full day</span>
          </div>
        </Card>

        {summary?.monthlyPayroll !== undefined ? (
          <Card padding="sm">
            <span className="text-[11px] font-semibold text-[#7185A5] block">Monthly Base Payroll</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-mono font-bold text-[#5038F5]">
                {formatMoney(String(summary.monthlyPayroll))}
              </span>
              <span className="text-xs text-[#7185A5]">/ month</span>
            </div>
          </Card>
        ) : (
          <Card padding="sm">
            <span className="text-[11px] font-semibold text-[#7185A5] block">Inactive / Alumni</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-mono font-bold text-[#7185A5]">{summary?.inactive ?? '—'}</span>
              <span className="text-xs text-[#7185A5]">Preserved records</span>
            </div>
          </Card>
        )}
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search employees"
              placeholder="Search by name, email, designation, or code..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <select
            aria-label="Filter by department"
            value={departmentFilter}
            onChange={e => {
              setDepartmentFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            <option value="">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value as '' | EmploymentStatus);
              setOffset(0);
            }}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            <option value="">All Statuses</option>
            {(Object.keys(EMPLOYMENT_STATUS_LABEL) as EmploymentStatus[]).map(s => (
              <option key={s} value={s}>
                {EMPLOYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Employee Listing Table */}
      <Card padding="none" className="overflow-hidden">
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : list.isLoading && !list.data ? (
          <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
            Loading employees...
          </p>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={hasFilters ? 'No employees found' : 'No employees yet'}
            description={
              hasFilters ? 'No employees match your search or filters.' : 'Add the first employee to start the roster.'
            }
            actionLabel={isAdmin && !hasFilters ? 'Add Employee' : undefined}
            onAction={openAdd}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Last Login</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Monthly Salary</th>}
                  <th className="py-3 px-4 text-center">Work Status</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {employees.map(emp => {
                  const account = loginStatus(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={emp.fullName} url={emp.avatarUrl} />
                          <div>
                            <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                              {emp.fullName}
                              <span className="font-mono text-[10px] text-[#7185A5]">({emp.code})</span>
                            </div>
                            <div className="text-[11px] text-[#7185A5]">{emp.workEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-[#111827]">{emp.department}</td>
                      <td className="py-3 px-4 text-[#475569]">{emp.designation}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant={account.variant} size="sm">
                          {account.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                        {emp.login?.lastLoginAt ? formatDateIst(emp.login.lastLoginAt) : 'Never'}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#111827] whitespace-nowrap">
                          {emp.monthlySalary !== undefined
                            ? formatMoney(String(emp.monthlySalary))
                            : '—'}
                        </td>
                      )}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge variant={statusBadgeVariant(emp.status)}>{EMPLOYMENT_STATUS_LABEL[emp.status]}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/employees/${emp.id}`)}
                            className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="View profile"
                            aria-label={`View ${emp.fullName}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openEdit(emp)}
                                className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                                title="Edit employee"
                                aria-label={`Edit ${emp.fullName}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {emp.status !== 'inactive' ? (
                                <button
                                  onClick={() => setEmployeeToDeactivate(emp)}
                                  disabled={busy}
                                  className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer disabled:opacity-50"
                                  title="Deactivate employee (history is kept)"
                                  aria-label={`Deactivate ${emp.fullName}`}
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setRestoreLogin(false);
                                    setEmployeeToReactivate(emp);
                                  }}
                                  disabled={busy}
                                  className="p-1.5 text-[#047857] hover:bg-[#047857]/10 rounded cursor-pointer disabled:opacity-50"
                                  title="Reactivate employee"
                                  aria-label={`Reactivate ${emp.fullName}`}
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft className="w-3.5 h-3.5" />}
                disabled={offset === 0 || list.isLoading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total || list.isLoading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add / edit (admin only) */}
      {isAdmin && (
        <EmployeeModal
          isOpen={isAddEmployeeOpen}
          onClose={() => {
            setIsAddEmployeeOpen(false);
            setEmployeeToEdit(null);
          }}
          employeeToEdit={employeeToEdit}
          onSaved={(saved, created) =>
            afterChange(saved, created ? `${saved.fullName} added as ${saved.code}` : `${saved.fullName} updated`)
          }
        />
      )}

      {/* Detail (routed) */}
      {viewId && (
        <EmployeeDetailModal
          employeeId={viewId}
          onClose={() => navigate('/employees')}
          onEdit={isAdmin ? openEdit : undefined}
        />
      )}

      {/* Deactivate confirmation */}
      <ConfirmDialog
        isOpen={!!employeeToDeactivate}
        onClose={() => setEmployeeToDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Employee"
        message={
          employeeToDeactivate?.login
            ? `Deactivate ${employeeToDeactivate.fullName}? Their login will be disabled and they will be signed out. Historical records are kept.`
            : `Deactivate ${employeeToDeactivate?.fullName}? Their historical records are kept.`
        }
        confirmLabel="Deactivate"
        isDestructive={true}
      />

      {/* Reactivate (with the option to restore the login) */}
      <Modal
        isOpen={!!employeeToReactivate}
        onClose={() => setEmployeeToReactivate(null)}
        title="Reactivate Employee"
        description={employeeToReactivate ? `${employeeToReactivate.fullName} (${employeeToReactivate.code})` : undefined}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#475569]">They will be marked Active again and appear in the team directory.</p>
          {employeeToReactivate?.login?.status === 'disabled' && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-[#F7F9FC] cursor-pointer">
              <input
                type="checkbox"
                checked={restoreLogin}
                onChange={e => setRestoreLogin(e.target.checked)}
                className="mt-0.5 accent-[#5038F5]"
              />
              <span>
                <span className="font-semibold text-[#111827] block">Also restore their login</span>
                <span className="text-[#7185A5]">
                  Re-enables {employeeToReactivate.workEmail} with their existing password.
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setEmployeeToReactivate(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleReactivate}>
              Reactivate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
