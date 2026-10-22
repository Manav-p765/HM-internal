import React, { useState } from 'react';
import { Building2, Edit2, KeyRound, Mail, MapPin, Phone, Send, UserPlus, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { clientsApi } from '../../api/clients';
import { usersApi, accountState, ACCOUNT_STATE_LABEL } from '../../api/users';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { Client, PortalUser } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { AddUserModal } from '../users/AddUserModal';
import { ClientInvoicesSection } from './ClientInvoicesSection';

interface ClientDetailModalProps {
  clientId: string; // from /clients/:id
  onClose: () => void;
  onEdit: (client: Client) => void;
  onChanged: () => void; // refresh the list behind
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATE_VARIANT = { invited: 'warning', active: 'success', disabled: 'danger' } as const;

function portalStatus(user: PortalUser): { label: string; variant: 'success' | 'warning' | 'danger' } {
  const state = accountState(user);
  return { label: ACCOUNT_STATE_LABEL[state], variant: STATE_VARIANT[state] };
}

type PendingAction = { kind: 'disable' | 'invite' | 'reset'; user: PortalUser };

// Company details plus its portal logins. Passwords are never shown or sent: users set their own from an
// emailed link.
export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({ clientId, onClose, onEdit, onChanged }) => {
  const { showToast, currentUser } = useApp();
  const detail = useApiData(() => clientsApi.get(clientId), [clientId]);
  const client = detail.data?.id === clientId ? detail.data : undefined;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const refresh = () => {
    detail.reload();
    onChanged();
  };

  const runUserAction = async (user: PortalUser, action: () => Promise<unknown>, message: string) => {
    setBusyUserId(user.id);
    try {
      await action();
      showToast('success', message);
      refresh();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmPending = () => {
    if (!pending) return;
    const { kind, user } = pending;
    setPending(null);
    if (kind === 'disable') {
      runUserAction(user, () => usersApi.update(user.id, { status: 'disabled' }), `${user.email} disabled and signed out`);
    } else if (kind === 'invite') {
      runUserAction(user, () => usersApi.resendInvite(user.id), `A new invite link was emailed to ${user.email}`);
    } else {
      runUserAction(user, () => usersApi.sendResetLink(user.id), `A password reset link was emailed to ${user.email}`);
    }
  };

  if (!client) {
    return (
      <Modal isOpen onClose={onClose} title="Client" size="xl">
        {detail.error ? (
          <LoadError message={detail.error} onRetry={detail.reload} />
        ) : (
          <p className="py-10 text-center text-xs text-[#7185A5]" role="status">
            Loading...
          </p>
        )}
      </Modal>
    );
  }

  const isInactive = client.status === 'inactive';
  const users = client.users ?? [];

  return (
    <>
      <Modal isOpen onClose={onClose} title={client.companyName} description="Client company and portal access" size="4xl">
        <div className="space-y-6 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1]">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#111827]">{client.companyName}</span>
                  <Badge variant={isInactive ? 'neutral' : 'success'} size="sm">
                    {isInactive ? 'Inactive' : 'Active'}
                  </Badge>
                </div>
                {client.contactName && <p className="text-[#475569]">{client.contactName}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#7185A5]">
                  {client.contactEmail && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {client.contactEmail}
                    </span>
                  )}
                  {client.contactPhone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {client.contactPhone}
                    </span>
                  )}
                  {client.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {client.address}
                    </span>
                  )}
                </div>
                {client.gstin && <p className="font-mono text-[11px] text-[#7185A5]">GSTIN {client.gstin}</p>}
                <p className="text-[11px] text-[#7185A5]">Invoices in {client.currency}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => onEdit(client)}>
              Edit Client
            </Button>
          </div>

          {client.notes && (
            <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white">
              <span className="font-semibold text-[#7185A5] block mb-1">Internal notes (staff only)</span>
              <p className="text-[#111827] whitespace-pre-line">{client.notes}</p>
            </div>
          )}

          <div className="rounded-xl border border-[#DFE6F1] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#DFE6F1] bg-white">
              <span className="font-semibold text-[#111827] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#5038F5]" />
                Portal users ({users.length})
              </span>
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlus className="w-3.5 h-3.5" />}
                disabled={isInactive}
                title={isInactive ? 'Reactivate the company to add portal users' : undefined}
                onClick={() => setIsAddOpen(true)}
              >
                Add portal user
              </Button>
            </div>
            {users.length === 0 ? (
              <p className="px-4 py-6 text-center text-[#7185A5]">No portal logins yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F7F9FC] text-[11px] font-semibold text-[#7185A5] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Login email</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Last sign-in</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {users.map(user => {
                    const status = portalStatus(user);
                    const busy = busyUserId === user.id;
                    return (
                      <tr key={user.id}>
                        <td className="px-4 py-2.5 font-medium text-[#111827]">{user.email}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={status.variant} size="sm">
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-[#475569]">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="text-[#7185A5]">Never</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-2">
                            {user.status === 'active' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || isInactive}
                                  icon={!user.invited ? <KeyRound className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                                  onClick={() => setPending({ kind: !user.invited ? 'reset' : 'invite', user })}
                                >
                                  {!user.invited ? 'Send reset link' : 'Resend invite'}
                                </Button>
                                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPending({ kind: 'disable', user })}>
                                  Disable
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy || isInactive}
                                title={isInactive ? 'Reactivate the company first' : undefined}
                                onClick={() =>
                                  runUserAction(user, () => usersApi.update(user.id, { status: 'active' }), `${user.email} can sign in again`)
                                }
                              >
                                Enable
                              </Button>
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
          </div>

          {/* Billing is admin only: managers see no invoices or amounts (the API refuses them too). */}
          {currentUser.role === 'admin' && <ClientInvoicesSection clientId={clientId} />}
        </div>
      </Modal>

      {isAddOpen && (
        <AddUserModal
          fixedClient={{ id: client.id, companyName: client.companyName }}
          onClose={() => setIsAddOpen(false)}
          onCreated={user => {
            setIsAddOpen(false);
            showToast('success', `Invite emailed to ${user.email}`);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title={pending?.kind === 'disable' ? 'Disable portal user' : pending?.kind === 'invite' ? 'Resend invite' : 'Send reset link'}
        message={
          pending?.kind === 'disable'
            ? `${pending.user.email} will be signed out immediately and won't be able to sign in until re-enabled.`
            : pending?.kind === 'invite'
              ? `${pending.user.email} will be emailed a new link to set their password (valid for 72 hours). Any earlier invite link stops working.`
              : `${pending?.user.email} will be emailed a link to choose a new password (valid for 1 hour). Their current password keeps working until they use it.`
        }
        confirmLabel={pending?.kind === 'disable' ? 'Disable' : pending?.kind === 'invite' ? 'Resend invite' : 'Send reset link'}
        isDestructive={pending?.kind === 'disable'}
      />
    </>
  );
};
