import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { employeesApi } from '../../api/employees';
import { useApiData } from '../../api/useApiData';
import { Department, EMPLOYMENT_STATUS_LABEL } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { Search, Mail, Building, Plus, Users } from 'lucide-react';
import { Button } from '../common/Button';
import { statusBadgeVariant } from '../employees/employeeDisplay';

// Everyone can see the directory; it has no phone numbers or salary data (GET /api/employees/directory).
export const TeamDirectoryView: React.FC = () => {
  const { currentUser, setIsAddEmployeeOpen } = useApp();
  const navigate = useNavigate();
  const directory = useApiData(() => employeesApi.directory(), []);
  const employees = directory.data ?? [];

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<'all' | Department>('all');

  const filtered = useMemo(() => {
    return employees.filter(emp => {
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = emp.fullName.toLowerCase().includes(q);
        const matchesDesig = emp.designation.toLowerCase().includes(q);
        const matchesEmail = emp.workEmail.toLowerCase().includes(q);
        if (!matchesName && !matchesDesig && !matchesEmail) return false;
      }
      return true;
    });
  }, [employees, departmentFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Team Directory
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Internal organization roster and contact directory across departments
          </p>
        </div>

        {currentUser.role === 'admin' && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              navigate('/employees');
              setIsAddEmployeeOpen(true);
            }}
          >
            Add Team Member
          </Button>
        )}
      </div>

      {/* Filter and Search */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team members by name, title, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div className="w-full sm:w-auto">
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
        </div>
      </Card>

      {directory.error && (
        <Card padding="none">
          <LoadError message={directory.error} onRetry={directory.reload} />
        </Card>
      )}
      {directory.isLoading && !directory.data && (
        <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
          Loading team...
        </p>
      )}
      {directory.data && filtered.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={employees.length === 0 ? 'No team members yet' : 'No one matches'}
            description={employees.length === 0 ? 'Employees appear here once they are added.' : 'Try a different name or department.'}
          />
        </Card>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => (
          <Card key={emp.id} padding="md" className="flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={emp.fullName} url={emp.avatarUrl} size="lg" />
                  <div>
                    <h3 className="text-sm font-bold text-[#111827]">{emp.fullName}</h3>
                    <p className="text-xs text-[#7185A5]">{emp.designation}</p>
                  </div>
                </div>

                <Badge variant={statusBadgeVariant(emp.status)} size="sm">
                  {EMPLOYMENT_STATUS_LABEL[emp.status]}
                </Badge>
              </div>

              <div className="mt-4 pt-3 border-t border-[#DFE6F1] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#475569]">
                  <Building className="w-3.5 h-3.5 text-[#7185A5]" />
                  <span>{emp.department}</span>
                </div>
                <div className="flex items-center gap-2 text-[#475569]">
                  <Mail className="w-3.5 h-3.5 text-[#7185A5]" />
                  <a href={`mailto:${emp.workEmail}`} className="hover:text-[#5038F5] truncate">
                    {emp.workEmail}
                  </a>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
