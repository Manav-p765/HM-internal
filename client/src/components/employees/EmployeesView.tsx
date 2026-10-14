import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApp } from '../../context/AppContext';
import { Employee, Department, EmploymentStatus } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmployeeModal } from './EmployeeModal';
import { EmployeeDetailModal } from './EmployeeDetailModal';
import {
  Users,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  UserX,
  UserCheck,
  Building,
  Mail,
  Phone,
  Calendar,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

export const EmployeesView: React.FC = () => {
  const {
    employees,
    deactivateEmployee,
    settings,
    currentUser,
    isAddEmployeeOpen,
    setIsAddEmployeeOpen,
  } = useApp();

  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const { id: viewId } = useParams();
  const navigate = useNavigate();
  const employeeToView = viewId ? employees.find(emp => emp.id === viewId) ?? null : null;
  const setEmployeeToView = (emp: Employee | null) => navigate(emp ? `/employees/${emp.id}` : '/employees');
  const [employeeToDeactivate, setEmployeeToDeactivate] = useState<Employee | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<'all' | Department>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EmploymentStatus>('all');

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
      if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = emp.fullName.toLowerCase().includes(query);
        const matchesEmail = emp.workEmail.toLowerCase().includes(query);
        const matchesDesig = emp.designation.toLowerCase().includes(query);
        const matchesId = emp.id.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesDesig && !matchesId) return false;
      }
      return true;
    });
  }, [employees, departmentFilter, statusFilter, search]);

  const activeCount = employees.filter(e => e.status === 'Active').length;
  const onLeaveCount = employees.filter(e => e.status === 'On Leave').length;
  const inactiveCount = employees.filter(e => e.status === 'Inactive').length;

  const totalMonthlyPayroll = useMemo(() => {
    return employees
      .filter(e => e.status === 'Active')
      .reduce((sum, e) => sum + e.monthlySalary, 0);
  }, [employees]);

  const canViewSalary = currentUser.role === 'admin' || currentUser.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Employee Management
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Internal workforce roster, designations, and compensation baselines
          </p>
        </div>

        {currentUser.role !== 'employee' && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setEmployeeToEdit(null);
              setIsAddEmployeeOpen(true);
            }}
          >
            Add Employee
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">Total Team Roster</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#111827]">
              {employees.length}
            </span>
            <span className="text-xs text-[#7185A5]">Total headcount</span>
          </div>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">Active Members</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#047857]">
              {activeCount}
            </span>
            <span className="text-xs text-[#047857]">Working actively</span>
          </div>
        </Card>

        <Card padding="sm">
          <span className="text-[11px] font-semibold text-[#7185A5] block">On Leave</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-[#B45309]">
              {onLeaveCount}
            </span>
            <span className="text-xs text-[#B45309]">Scheduled leave</span>
          </div>
        </Card>

        {canViewSalary ? (
          <Card padding="sm">
            <span className="text-[11px] font-semibold text-[#7185A5] block">Monthly Base Payroll</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-mono font-bold text-[#5038F5]">
                {formatCurrency(totalMonthlyPayroll, settings.defaultCurrency)}
              </span>
              <span className="text-xs text-[#7185A5]">/ month</span>
            </div>
          </Card>
        ) : (
          <Card padding="sm">
            <span className="text-[11px] font-semibold text-[#7185A5] block">Inactive / Alumni</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-mono font-bold text-[#7185A5]">
                {inactiveCount}
              </span>
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
              type="text"
              placeholder="Search by name, email, designation, or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Marketing">Marketing</option>
              <option value="Operations">Operations</option>
              <option value="Finance">Finance</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Employee Listing Table */}
      <Card padding="none" className="overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No employees found"
            description="No employees match your search query or department filter."
            actionLabel={currentUser.role !== 'employee' ? 'Add Employee' : undefined}
            onAction={() => {
              setEmployeeToEdit(null);
              setIsAddEmployeeOpen(true);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Joining Date</th>
                  {canViewSalary && (
                    <th className="py-3 px-4 text-right">Monthly Salary</th>
                  )}
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center font-bold text-xs shrink-0 border border-[#DFE6F1]">
                          {emp.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                            {emp.fullName}
                            <span className="font-mono text-[10px] text-[#7185A5]">
                              ({emp.id})
                            </span>
                          </div>
                          <div className="text-[11px] text-[#7185A5]">{emp.workEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">
                      {emp.department}
                    </td>
                    <td className="py-3 px-4 text-[#475569]">
                      {emp.designation}
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {formatDate(emp.joiningDate)}
                    </td>
                    {canViewSalary && (
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#111827] whitespace-nowrap">
                        {formatCurrency(emp.monthlySalary, settings.defaultCurrency)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant={
                          emp.status === 'Active'
                            ? 'success'
                            : emp.status === 'On Leave'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {emp.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEmployeeToView(emp)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          title="View Profile & Salary History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {currentUser.role !== 'employee' && (
                          <button
                            onClick={() => {
                              setEmployeeToEdit(emp);
                              setIsAddEmployeeOpen(true);
                            }}
                            className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {currentUser.role === 'admin' && emp.status !== 'Inactive' && (
                          <button
                            onClick={() => setEmployeeToDeactivate(emp)}
                            className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Deactivate Employee"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={isAddEmployeeOpen}
        onClose={() => {
          setIsAddEmployeeOpen(false);
          setEmployeeToEdit(null);
        }}
        employeeToEdit={employeeToEdit}
      />

      {/* Employee Detail Modal */}
      <EmployeeDetailModal
        isOpen={!!employeeToView}
        onClose={() => setEmployeeToView(null)}
        employee={employeeToView}
        onEdit={emp => {
          setEmployeeToEdit(emp);
          setIsAddEmployeeOpen(true);
        }}
      />

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        isOpen={!!employeeToDeactivate}
        onClose={() => setEmployeeToDeactivate(null)}
        onConfirm={() => {
          if (employeeToDeactivate) {
            deactivateEmployee(employeeToDeactivate.id);
            setEmployeeToDeactivate(null);
          }
        }}
        title="Deactivate Employee"
        message={`Are you sure you want to deactivate ${employeeToDeactivate?.fullName}? Their historical records, invoices, and past salaries will be safely preserved.`}
        confirmLabel="Deactivate"
        isDestructive={true}
      />
    </div>
  );
};
