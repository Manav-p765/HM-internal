import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi, ManagedUser, EmployeeOption } from '../../api/users';
import { clientsApi } from '../../api/clients';
import { ApiError, errorMessage } from '../../api/client';
import { Client, UserRole } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';

export const ROLE_LABEL: Record<UserRole, string> = {
  employee: 'Employee',
  manager: 'Manager',
  admin: 'Admin',
  client: 'Client (portal)',
};

interface AddUserModalProps {
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
  // From a client's detail panel: role fixed to client, company preselected.
  fixedClient?: { id: string; companyName: string };
}

const fieldClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// Creates a login. The server generates a temporary password and emails it; it is never shown here.
// Admins may create any role; managers only client (portal) users.
export const AddUserModal: React.FC<AddUserModalProps> = ({ onClose, onCreated, fixedClient }) => {
  const { currentUser } = useApp();
  const isAdmin = currentUser.role === 'admin';
  const roleOptions: UserRole[] = fixedClient || !isAdmin ? ['client'] : ['employee', 'manager', 'admin', 'client'];

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(roleOptions[0]);
  const [employeeId, setEmployeeId] = useState('');
  const [clientId, setClientId] = useState(fixedClient?.id ?? '');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [clientOptions, setClientOptions] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Both lists are optional helpers: a failure just leaves the dropdown empty.
    if (isAdmin && !fixedClient) usersApi.employeeOptions().then(setEmployeeOptions).catch(() => setEmployeeOptions([]));
    if (!fixedClient) {
      clientsApi
        .list({ status: 'active', limit: 200 })
        .then(r => setClientOptions(r.clients))
        .catch(() => setClientOptions([]));
    }
  }, [isAdmin, fixedClient]);

  const isClient = role === 'client';

  const selectEmployee = (id: string) => {
    setEmployeeId(id);
    const employee = employeeOptions.find(e => e.id === id);
    if (employee && !email.trim()) setEmail(employee.workEmail);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (isClient && !clientId) {
      setFieldErrors({ clientId: 'Choose the client company' });
      return;
    }
    setIsSaving(true);
    try {
      onCreated(
        await usersApi.create({
          email: email.trim(),
          role,
          employeeId: isClient ? null : employeeId || null,
          clientId: isClient ? clientId : null,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const byField: Record<string, string> = {};
        for (const d of err.details) byField[d.path] ??= d.message;
        setFieldErrors(byField);
      }
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={fixedClient ? `Add portal user: ${fixedClient.companyName}` : 'Add user'}
      description="A temporary password is generated and emailed to this address. They must change it at first sign-in."
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 text-xs text-[#E11D48]">
            {error}
          </div>
        )}

        {!fixedClient && (
          <FormField label="Role" error={fieldErrors.role} hint={!isAdmin ? 'Managers can add client portal users only.' : undefined}>
            <select
              id="add-user-role"
              aria-label="Role"
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              disabled={roleOptions.length === 1}
              className={`${fieldClass} disabled:opacity-70`}
            >
              {roleOptions.map(r => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {isClient && !fixedClient && (
          <FormField label="Client company" required error={fieldErrors.clientId} hint="Only active companies are listed.">
            <select
              id="add-user-client"
              aria-label="Client company"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Choose a company…</option>
              {clientOptions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {!isClient && isAdmin && (
          <FormField label="Linked employee (optional)" error={fieldErrors.employeeId} hint="Only employees without a login are listed.">
            <select
              id="add-user-employee"
              aria-label="Linked employee"
              value={employeeId}
              onChange={e => selectEmployee(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not linked to an employee record</option>
              {employeeOptions.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.code})
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label={isClient ? 'Login email' : 'Work email'} required error={fieldErrors.email}>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="add-user-email"
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={isClient ? 'name@clientcompany.com' : 'name@hybridmonks.com'}
              className={`${fieldClass} pl-9`}
            />
          </div>
        </FormField>

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
