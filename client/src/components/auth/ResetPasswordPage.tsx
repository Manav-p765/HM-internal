import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { authApi } from '../../api/auth';
import { errorMessage } from '../../api/client';
import { Button } from '../common/Button';
import { AuthLayout, PasswordField, MIN_PASSWORD_LENGTH, checkNewPassword } from './AuthLayout';

// Opened from the emailed link: /reset-password?token=...
export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  // Back to sign-in; replace so the one-time token doesn't stay in history.
  const onDone = (notice?: string) => navigate('/login', { replace: true, state: notice ? { notice } : undefined });
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(token ? '' : 'This reset link is incomplete. Please request a new one.');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(newPassword, confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const { message } = await authApi.resetPassword(token, newPassword);
      onDone(message);
    } catch (err) {
      setError(errorMessage(err));
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password for your workplace account" error={error}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          id="reset-new-password"
          label="New Password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <PasswordField
          id="reset-confirm-password"
          label="Repeat New Password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <Button type="submit" variant="primary" size="md" className="w-full mt-2" disabled={isLoading || !token}>
          {isLoading ? 'Saving...' : 'Reset password'}
        </Button>
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => onDone()}
            className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer"
          >
            Back to sign in
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};
