import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Employee, Department } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Search, Mail, Phone, Calendar, Building, Plus } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { Button } from '../common/Button';

export const TeamDirectoryView: React.FC = () => {
  const { employees, currentUser, setIsAddEmployeeOpen } = useApp();

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

        {currentUser.role !== 'employee' && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setIsAddEmployeeOpen(true)}
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

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => (
          <Card key={emp.id} padding="md" className="flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-[#5038F5]/10 border border-[#DFE6F1] flex items-center justify-center font-bold text-sm text-[#5038F5] shrink-0">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt={emp.fullName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      emp.fullName.charAt(0)
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#111827]">{emp.fullName}</h3>
                    <p className="text-xs text-[#7185A5]">{emp.designation}</p>
                  </div>
                </div>

                <Badge
                  variant={
                    emp.status === 'Active'
                      ? 'success'
                      : emp.status === 'On Leave'
                      ? 'warning'
                      : 'neutral'
                  }
                  size="sm"
                >
                  {emp.status}
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
                {emp.phoneNumber && (
                  <div className="flex items-center gap-2 text-[#475569]">
                    <Phone className="w-3.5 h-3.5 text-[#7185A5]" />
                    <span>{emp.phoneNumber}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[#7185A5] text-[11px]">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Joined {formatDate(emp.joiningDate)}</span>
                </div>
              </div>
            </div>

            {emp.notes && (
              <div className="mt-3 pt-2 text-[11px] text-[#7185A5] italic line-clamp-2">
                "{emp.notes}"
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
