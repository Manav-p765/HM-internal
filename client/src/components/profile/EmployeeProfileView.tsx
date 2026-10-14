import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { employeesApi } from '../../api/employees';
import { ApiError, errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { EMPLOYMENT_STATUS_LABEL } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { FormField } from '../common/FormField';
import { statusBadgeVariant } from '../employees/employeeDisplay';
import { ShieldCheck, User, CheckCircle2, Edit2, UserX } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

const inputClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// The signed-in user's own employee record (GET /api/employees/me). Staff may change only their
// phone number and avatar; everything else is maintained by an admin.
export const EmployeeProfileView: React.FC = () => {
  const { currentUser, attendance, showToast } = useApp();
  const profile = useApiData(() => employeesApi.me(), []);
  const me = profile.data;

  const [isEditing, setIsEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; avatarUrl?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  // Attendance is still local (deferred module).
  const totalShiftsLogged = useMemo(
    () => (me ? attendance.filter(a => a.employeeId === me.id).length : 0),
    [attendance, me],
  );

  const startEdit = () => {
    setPhone(me?.phone ?? '');
    setAvatarUrl(me?.avatarUrl ?? '');
    setFieldErrors({});
    setIsEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    try {
      const updated = await employeesApi.updateMe({ phone: phone.trim() || null, avatarUrl: avatarUrl.trim() || null });
      profile.setData(updated);
      setIsEditing(false);
      showToast('success', 'Profile updated');
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const errors: { phone?: string; avatarUrl?: string } = {};
        for (const d of err.details) if (d.path === 'phone' || d.path === 'avatarUrl') errors[d.path] ??= d.message;
        setFieldErrors(errors);
      }
      showToast('error', errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const header = (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">My Employee Profile</h1>
      <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
        Verified company records, employment status, and authenticated profile
      </p>
    </div>
  );

  if (profile.error) {
    const notLinked = profile.error.toLowerCase().includes('not linked');
    return (
      <div className="space-y-6">
        {header}
        <Card padding="none">
          {notLinked ? (
            <EmptyState
              icon={<UserX className="w-6 h-6" />}
              title="No employee record"
              description={`${currentUser.email} is not linked to an employee record, so there is no profile to show.`}
            />
          ) : (
            <LoadError message={profile.error} onRetry={profile.reload} />
          )}
        </Card>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="space-y-6">
        {header}
        <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
          Loading profile...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card padding="lg" className="flex flex-col items-center text-center">
          <Avatar name={me.fullName} url={me.avatarUrl} size="xl" className="mb-4" />
          <h2 className="text-lg font-bold text-[#111827]">{me.fullName}</h2>
          <p className="text-xs text-[#7185A5] mt-0.5">{me.designation}</p>

          <div className="flex items-center gap-2 mt-3">
            <Badge variant="purple" size="md">
              Role: {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}
            </Badge>
            <Badge variant={statusBadgeVariant(me.status)} size="md">
              {EMPLOYMENT_STATUS_LABEL[me.status]}
            </Badge>
          </div>

          <div className="w-full mt-6 pt-4 border-t border-[#DFE6F1] space-y-2 text-left text-xs">
            <div className="flex justify-between text-[#7185A5]">
              <span>Employee ID:</span>
              <span className="font-mono font-bold text-[#111827]">{me.code}</span>
            </div>
            <div className="flex justify-between text-[#7185A5]">
              <span>Department:</span>
              <span className="font-medium text-[#111827]">{me.department}</span>
            </div>
            <div className="flex justify-between text-[#7185A5]">
              <span>Joined:</span>
              <span className="font-medium text-[#111827]">{formatDate(me.joiningDate)}</span>
            </div>
          </div>
        </Card>

        {/* Details & Security Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                <User className="w-4 h-4 text-[#5038F5]" />
                Employment Details
              </h3>
              {!isEditing && (
                <Button variant="outline" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={startEdit}>
                  Edit contact details
                </Button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={save} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Contact Phone" error={fieldErrors.phone}>
                    <input
                      aria-label="Contact Phone"
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Avatar Image URL" error={fieldErrors.avatarUrl} hint="Leave empty to show your initials.">
                    <input
                      aria-label="Avatar Image URL"
                      type="text"
                      value={avatarUrl}
                      onChange={e => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  </FormField>
                </div>
                <p className="text-[11px] text-[#7185A5]">
                  Name, email, department and designation are maintained by an administrator.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                  <span className="text-[11px] text-[#7185A5] block">Official Work Email</span>
                  <span className="font-medium text-[#111827] mt-0.5 block">{me.workEmail}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                  <span className="text-[11px] text-[#7185A5] block">Registered Contact Phone</span>
                  <span className="font-medium text-[#111827] mt-0.5 block">{me.phone || 'Not provided'}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                  <span className="text-[11px] text-[#7185A5] block">Designation</span>
                  <span className="font-medium text-[#111827] mt-0.5 block">{me.designation}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                  <span className="text-[11px] text-[#7185A5] block">Total Shifts Completed</span>
                  <span className="font-mono font-bold text-[#047857] mt-0.5 block">{totalShiftsLogged} working days</span>
                </div>
              </div>
            )}
          </Card>

          <Card padding="md">
            <h3 className="text-sm font-bold text-[#111827] mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#047857]" />
              Account Security & Access Privileges
            </h3>
            <p className="text-xs text-[#7185A5] mb-4">Your sign-in account is linked to this employee record.</p>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#047857]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Signed in as {currentUser.email}</span>
              </div>
              <div className="flex items-center gap-2 text-[#047857]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Salary and company financials are only visible to administrators</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
