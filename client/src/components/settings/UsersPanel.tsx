import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Send, UserPlus, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi, ManagedUser, accountState, ACCOUNT_STATE_LABEL } from '../../api/users';
import { AddUserModal } from '../users/AddUserModal';
import { errorMessage } from '../../api/client';
import { StaffRole, UserRole } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';

// Role changes are between staff roles only; a client user stays a client (their company link can't be changed).
const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
]

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

type PendingAction = { kind: 'disable' | 'invite' | 'reset'; user: ManagedUser };

const STATE_BADGE = { invited: 'warning', active: 'success', disabled: 'error' } as const;

// Admin-only user management (Settings > Users). Accounts are created here; the server emails the user a
// one-time link to set their own password. Passwords are never shown or sent by this UI.
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

  const changeRole = (user: ManagedUser, role: StaffRole) =>
    runAction(user, () => usersApi.update(user.id, { role }), `${user.email} is now ${role === 'admin' ? 'an admin' : `a ${role}`}`);

  const enable = (user: ManagedUser) =>
    runAction(user, () => usersApi.update(user.id, { status: 'active' }), `${user.email} can sign in again`);

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    const { kind, user } = pendingAction;
    setPendingAction(null);
    if (kind === 'disable') {
      runAction(user, () => usersApi.update(user.id, { status: 'disabled' }), `${user.email} has been disabled and signed out`);
    } else if (kind === 'invite') {
      runAction(user, () => usersApi.resendInvite(user.id), `A new invite link was emailed to ${user.email}`);
    } else {
      runAction(user, () => usersApi.sendResetLink(user.id), `A password reset link was emailed to ${user.email}`);
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
              People who can sign in. New users get an email with a link to set their own password (valid for 72 hours).
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
                  <th className="px-4 py-3">Linked to</th>
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
                        {user.client ? (
                          <>
                            {user.client.companyName}
                            <span className="ml-1.5 text-[10px] text-[#7185A5]">client portal</span>
                          </>
                        ) : user.employee ? (
                          <>
                            {user.employee.name}
                            <span className="ml-1.5 font-mono text-[10px] text-[#7185A5]">{user.employee.code}</span>
                          </>
                        ) : (
                          <span className="text-[#7185A5]">Not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.role === 'client' ? (
                          <Badge variant="info" size="sm">Client</Badge>
                        ) : (
                        <select
                          aria-label={`Role for ${user.email}`}
                          value={user.role}
                          disabled={isSelf || isBusy}
                          title={isSelf ? 'You cannot change your own role' : undefined}
                          onChange={e => changeRole(user, e.target.value as StaffRole)}
                          className="text-xs px-2 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {STAFF_ROLES.map(r => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span title={accountState(user) === 'invited' && user.inviteExpiresAt ? `Invite link valid until ${formatDateTime(user.inviteExpiresAt)}` : undefined}>
                          <Badge variant={STATE_BADGE[accountState(user)]} size="sm">{ACCOUNT_STATE_LABEL[accountState(user)]}</Badge>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="text-[#7185A5]">Never</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!isSelf && (
                          <div className="flex items-center justify-end gap-2">
                            {user.status === 'active' ? (
                              <>
                                {!user.invited ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy}
                                    icon={<KeyRound className="w-3.5 h-3.5" />}
                                    onClick={() => setPendingAction({ kind: 'reset', user })}
                                  >
                                    Send reset link
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy}
                                    icon={<Send className="w-3.5 h-3.5" />}
                                    onClick={() => setPendingAction({ kind: 'invite', user })}
                                  >
                                    Resend invite
                                  </Button>
                                )}
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
            showToast('success', `Invite emailed to ${user.email}`);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        title={pendingAction?.kind === 'disable' ? 'Disable user' : pendingAction?.kind === 'invite' ? 'Resend invite' : 'Send reset link'}
        message={
          pendingAction?.kind === 'disable'
            ? `${pendingAction.user.email} will be signed out immediately and will not be able to sign in until re-enabled.`
            : pendingAction?.kind === 'invite'
              ? `${pendingAction.user.email} will be emailed a new link to set their password (valid for 72 hours). Any earlier invite link stops working.`
              : `${pendingAction?.user.email} will be emailed a link to choose a new password (valid for 1 hour). Their current password keeps working until they use it.`
        }
        confirmLabel={pendingAction?.kind === 'disable' ? 'Disable user' : pendingAction?.kind === 'invite' ? 'Resend invite' : 'Send reset link'}
        isDestructive={pendingAction?.kind === 'disable'}
      />
    </div>
  );
};
