import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Send, UserPlus, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi, ManagedUser, EmployeeOption } from '../../api/users';
import { errorMessage } from '../../api/client';
import { UserRole } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

type PendingAction = { kind: 'disable' | 'resend'; user: ManagedUser };

// Admin-only user management (Settings > Users). Accounts are created here; the server emails a
// temporary password to the user. Passwords are never shown in this UI.
export const UsersPanel: React.FC = () => {
  const { currentUser, showToast } = useApp();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await usersApi.list());
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Runs one row action, swaps the updated user into the table and reports the outcome.
  const runAction = async (user: ManagedUser, action: () => Promise<ManagedUser>, successMessage: string) => {
    setBusyUserId(user.id);
    try {
      const updated = await action();
      setUsers(current => current.map(u => (u.id === updated.id ? updated : u)));
      showToast('success', successMessage);
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const changeRole = (user: ManagedUser, role: UserRole) =>
    runAction(user, () => usersApi.update(user.id, { role }), `${user.email} is now ${role === 'admin' ? 'an admin' : `a ${role}`}`);

  const enable = (user: ManagedUser) =>
    runAction(user, () => usersApi.update(user.id, { status: 'active' }), `${user.email} can sign in again`);

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    const { kind, user } = pendingAction;
    setPendingAction(null);
    if (kind === 'disable') {
      runAction(user, () => usersApi.update(user.id, { status: 'disabled' }), `${user.email} has been disabled and signed out`);
    } else {
      runAction(user, () => usersApi.resendCredentials(user.id), `Credentials emailed to ${user.email}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[#DFE6F1]">
          <div>
            <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#5038F5]" />
              Users
            </h3>
            <p className="text-xs text-[#7185A5] mt-0.5">
              People who can sign in. New users receive a temporary password by email and must change it at first sign-in.
            </p>
          </div>
          <Button variant="primary" size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setIsAddOpen(true)}>
            Add user
          </Button>
        </div>

        {loadError ? (
          <div className="p-6 text-center">
            <p className="text-xs text-[#E11D48] mb-3">{loadError}</p>
            <Button variant="outline" size="sm" onClick={loadUsers}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <p className="p-6 text-center text-xs text-[#7185A5]">Loading users...</p>
        ) : users.length === 0 ? (
          <EmptyState icon={<Users className="w-5 h-5" />} title="No users yet" description="Add the first user to give someone access." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] text-[11px] font-semibold text-[#7185A5] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Linked employee</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last sign-in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {users.map(user => {
                  const isSelf = user.id === currentUser.id;
                  const isBusy = busyUserId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-[#F7F9FC]/60">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[#111827]">{user.email}</span>
                        {isSelf && <span className="ml-2 text-[10px] text-[#7185A5]">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {user.employee ? (
                          <>
                            {user.employee.name}
                            <span className="ml-1.5 font-mono text-[10px] text-[#7185A5]">{user.employee.code}</span>
                          </>
                        ) : (
                          <span className="text-[#7185A5]">Not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${user.email}`}
                          value={user.role}
                          disabled={isSelf || isBusy}
                          title={isSelf ? 'You cannot change your own role' : undefined}
                          onChange={e => changeRole(user, e.target.value as UserRole)}
                          className="text-xs px-2 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {user.status === 'disabled' ? (
                          <Badge variant="error" size="sm">Disabled</Badge>
                        ) : user.mustChangePassword ? (
                          <Badge variant="warning" size="sm">Temporary password</Badge>
                        ) : (
                          <Badge variant="success" size="sm">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="text-[#7185A5]">Never</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!isSelf && (
                          <div className="flex items-center justify-end gap-2">
                            {user.status === 'active' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  icon={<Send className="w-3.5 h-3.5" />}
                                  onClick={() => setPendingAction({ kind: 'resend', user })}
                                >
                                  Resend credentials
                                </Button>
                                <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setPendingAction({ kind: 'disable', user })}>
                                  Disable
                                </Button>
                              </>
                            ) : (
                              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => enable(user)}>
                                Enable
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAddOpen && (
        <AddUserModal
          onClose={() => setIsAddOpen(false)}
          onCreated={user => {
            setUsers(current => [...current, user]);
            setIsAddOpen(false);
            showToast('success', `Credentials emailed to ${user.email}`);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        title={pendingAction?.kind === 'disable' ? 'Disable user' : 'Resend credentials'}
        message={
          pendingAction?.kind === 'disable'
            ? `${pendingAction.user.email} will be signed out immediately and will not be able to sign in until re-enabled.`
            : `${pendingAction?.user.email} will be signed out and emailed a new temporary password. Their current password will stop working.`
        }
        confirmLabel={pendingAction?.kind === 'disable' ? 'Disable user' : 'Send new password'}
        isDestructive={pendingAction?.kind === 'disable'}
      />
    </div>
  );
};

interface AddUserModalProps {
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // The link is optional, so a failure to load the list only leaves the dropdown empty.
    usersApi.employeeOptions().then(setEmployeeOptions).catch(() => setEmployeeOptions([]));
  }, []);

  const selectEmployee = (id: string) => {
    setEmployeeId(id);
    const employee = employeeOptions.find(e => e.id === id);
    if (employee && !email.trim()) setEmail(employee.workEmail);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      onCreated(await usersApi.create({ email: email.trim(), role, employeeId: employeeId || null }));
    } catch (err) {
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  const fieldClass =
    'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add user"
      description="A temporary password is generated and emailed to this address."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 text-xs text-[#E11D48]">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="add-user-employee" className="block text-xs font-semibold text-[#111827] mb-1">
            Linked employee <span className="font-normal text-[#7185A5]">(optional)</span>
          </label>
          <select id="add-user-employee" value={employeeId} onChange={e => selectEmployee(e.target.value)} className={fieldClass}>
            <option value="">Not linked to an employee record</option>
            {employeeOptions.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.code})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#7185A5] mt-1">Only employees without a login are listed.</p>
        </div>

        <div>
          <label htmlFor="add-user-email" className="block text-xs font-semibold text-[#111827] mb-1">
            Work email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="add-user-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@hybridmonks.com"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="add-user-role" className="block text-xs font-semibold text-[#111827] mb-1">
            Role
          </label>
          <select id="add-user-role" value={role} onChange={e => setRole(e.target.value as UserRole)} className={fieldClass}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
            {isSaving ? 'Creating...' : 'Create user and email credentials'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
