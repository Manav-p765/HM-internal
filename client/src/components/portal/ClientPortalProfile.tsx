import React, { useState } from 'react';
import { Building2, KeyRound, Mail, MapPin, Phone, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { clientsApi } from '../../api/clients';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { LoadError } from '../common/LoadError';
import { PasswordField, MIN_PASSWORD_LENGTH, checkNewPassword } from '../auth/AuthLayout';

// The client's own company (GET /api/clients/me, read-only) and a change-password form.
export const ClientPortalProfile: React.FC = () => {
  const { user, changePassword } = useAuth();
  const company = useApiData(() => clientsApi.me(), []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(newPassword, confirmation);
    if (problem) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setMessage({ kind: 'success', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const c = company.data;
  const row = (icon: React.ReactNode, label: string, value: string | null | undefined) => (
    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-white">
      <span className="text-[#7185A5] mt-0.5">{icon}</span>
      <div>
        <span className="text-[10px] text-[#7185A5] block">{label}</span>
        <span className="font-medium text-[#111827] whitespace-pre-line">{value || 'Not provided'}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Company Profile</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
          Contact Hybrid Monks if any of these details need to change.
        </p>
      </div>

      <Card padding="md">
        {company.error ? (
          <LoadError message={company.error} onRetry={company.reload} />
        ) : !c ? (
          <p className="py-8 text-center text-xs text-[#7185A5]" role="status">
            Loading...
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {row(<Building2 className="w-4 h-4" />, 'Company', c.companyName)}
            {row(<User className="w-4 h-4" />, 'Primary contact', c.contactName)}
            {row(<Mail className="w-4 h-4" />, 'Contact email', c.contactEmail)}
            {row(<Phone className="w-4 h-4" />, 'Phone', c.contactPhone)}
            <div className="sm:col-span-2">{row(<MapPin className="w-4 h-4" />, 'Address', c.address)}</div>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-bold text-[#111827] mb-1 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#5038F5]" />
          Change password
        </h3>
        <p className="text-xs text-[#7185A5] mb-4">Signed in as {user?.email}.</p>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
          {message && (
            <div
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-lg text-xs border ${
                message.kind === 'error'
                  ? 'bg-[#E11D48]/10 border-[#E11D48]/20 text-[#E11D48]'
                  : 'bg-[#047857]/10 border-[#047857]/20 text-[#047857]'
              }`}
            >
              {message.text}
            </div>
          )}
          <PasswordField id="portal-current-password" label="Current Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField
            id="portal-new-password"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
          <PasswordField id="portal-confirm-password" label="Repeat New Password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
          <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Change password'}
          </Button>
        </form>
      </Card>
    </div>
  );
};
