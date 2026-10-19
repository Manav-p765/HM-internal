import React, { useState } from 'react';
import { Link2 } from 'lucide-react';
import { usersApi, ManagedUser } from '../../api/users';
import { useApiData } from '../../api/useApiData';
import { errorMessage } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ROLE_LABEL } from './AddUserModal';

const fieldClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// Admin: link a staff login to an employee record (PUT /api/users/:id/employee). Opened either from a login
// (Settings > Users: choose an employee without a login) or from an employee (Employees: choose a staff
// login that is not linked yet). Logins and employees with the same email are linked automatically; this is
// for the rest. The server enforces one login per employee and never moves an existing link.
type LinkAccountModalProps = { onClose: () => void; onLinked: (user: ManagedUser) => void } & (
  | { user: Pick<ManagedUser, 'id' | 'email'>; employee?: never }
  | { employee: { id: string; fullName: string; code: string }; user?: never }
);

export const LinkAccountModal: React.FC<LinkAccountModalProps> = ({ onClose, onLinked, user, employee }) => {
  // From a login: employees without a login. From an employee: staff logins without an employee.
  const options = useApiData<{ id: string; label: string }[]>(
    () =>
      user
        ? usersApi.employeeOptions().then(list => list.map(e => ({ id: e.id, label: `${e.name} (${e.code}) · ${e.workEmail}` })))
        : usersApi
            .list()
            .then(list =>
              list.filter(u => u.role !== 'client' && !u.employee).map(u => ({ id: u.id, label: `${u.email} · ${ROLE_LABEL[u.role]}` })),
            ),
    [user?.id, employee?.id],
  );
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!choice) return setError(user ? 'Choose an employee' : 'Choose a login');
    setBusy(true);
    setError('');
    try {
      onLinked(user ? await usersApi.linkEmployee(user.id, choice) : await usersApi.linkEmployee(choice, employee!.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = user ? `Link ${user.email} to an employee` : `Link a login to ${employee!.fullName}`;
  return (
    <Modal isOpen onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-4">
        <p className="text-xs text-[#7185A5]">
          {user
            ? 'Their attendance, leave and payslips then belong to this login. Only employees without a login are listed.'
            : 'Their attendance, leave and payslips then belong to this login. Only staff logins that are not linked yet are listed.'}
        </p>
        {options.error ? (
          <p className="text-xs text-[#E11D48]">{options.error}</p>
        ) : !options.data ? (
          <p className="text-xs text-[#7185A5]">Loading…</p>
        ) : options.data.length === 0 ? (
          <p className="text-xs text-[#7185A5]">{user ? 'Every employee already has a login.' : 'Every staff login is already linked.'}</p>
        ) : (
          <select aria-label={user ? 'Employee' : 'Login'} value={choice} onChange={e => setChoice(e.target.value)} className={fieldClass}>
            <option value="">{user ? 'Choose an employee…' : 'Choose a login…'}</option>
            {options.data.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {error && (
          <p className="text-xs text-[#E11D48]" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DFE6F1]">
          <Button variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" icon={<Link2 className="w-4 h-4" />} onClick={submit} disabled={busy || !options.data?.length}>
            {busy ? 'Linking…' : 'Link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
