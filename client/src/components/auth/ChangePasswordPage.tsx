import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button } from '../common/Button';
import { AuthLayout, PasswordField, MIN_PASSWORD_LENGTH, checkNewPassword } from './AuthLayout';

// Shown instead of the app while the account still has its temporary password
// (the server refuses every other request until it is changed).
export const ChangePasswordPage: React.FC = () => {
  const { user, changePassword, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
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
      await changePassword(currentPassword, newPassword);
      // On success mustChangePassword is false and App shows the application.
    } catch (err) {
      setError(errorMessage(err));
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={`You are signed in as ${user?.email ?? ''} with a temporary password. Set your own password to continue.`}
      error={error}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          id="change-current-password"
          label="Temporary Password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          hint="The password from your account email."
        />
        <PasswordField
          id="change-new-password"
          label="New Password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <PasswordField
          id="change-confirm-password"
          label="Repeat New Password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <Button type="submit" variant="primary" size="md" className="w-full mt-2" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Set password and continue'}
        </Button>
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};
