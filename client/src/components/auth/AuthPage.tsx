import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth';
import { errorMessage } from '../../api/client';
import { Button } from '../common/Button';
import { AuthLayout, PasswordField } from './AuthLayout';

interface AuthPageProps {
  mode: 'login' | 'forgot'; // /login or /forgot-password
}

// Signed-out screens: sign in, and "forgot password". Accounts are created by an admin; there is no signup.
export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // e.g. "Your password has been reset" after /reset-password; "from" is where RequireAuth sent us from.
  const { notice, from } = (location.state as { notice?: string; from?: string } | null) ?? {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(notice ?? '');
  const [isLoading, setIsLoading] = useState(false);

  const switchMode = (next: 'login' | 'forgot') => {
    navigate(next === 'login' ? '/login' : '/forgot-password', { state: from ? { from } : undefined });
    setError('');
    setSuccess('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      // On success AuthProvider has a user and RedirectIfSignedIn moves on (to "from" or /dashboard).
    } catch (err) {
      setError(errorMessage(err));
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const { message } = await authApi.forgotPassword(email.trim());
      setSuccess(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const emailField = (
    <div>
      <label htmlFor="auth-email" className="block text-xs font-semibold text-[#111827] mb-1">
        Work Email Address
      </label>
      <div className="relative">
        <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id="auth-email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="name@hybridmonks.com"
          className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
        />
      </div>
    </div>
  );

  if (mode === 'forgot') {
    return (
      <AuthLayout
        title="Reset your password"
        subtitle="Enter your work email and we will send you a reset link"
        error={error}
        success={success}
      >
        <form onSubmit={handleForgot} className="space-y-4">
          {emailField}
          <Button type="submit" variant="primary" size="md" className="w-full mt-2" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Email me a reset link'}
          </Button>
          <p className="text-[11px] text-[#7185A5] text-center">The link can be used once and expires after 1 hour.</p>
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-xs font-semibold text-[#5038F5] hover:underline cursor-pointer"
            >
              Back to sign in
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in to your workplace"
      subtitle="Secure authentication for Hybrid Monks staff & management"
      error={error}
      success={success}
    >
      <form onSubmit={handleLogin} className="space-y-4">
        {emailField}
        <PasswordField
          id="auth-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          labelAction={
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="text-[11px] font-medium text-[#5038F5] hover:underline cursor-pointer"
            >
              Forgot password?
            </button>
          }
        />
        <Button type="submit" variant="primary" size="md" className="w-full mt-2" disabled={isLoading}>
          {isLoading ? 'Verifying...' : 'Sign in to Portal'}
        </Button>
        <p className="text-[11px] text-[#7185A5] text-center pt-2">
          Accounts are created by an administrator. Ask your admin if you need access.
        </p>
      </form>
    </AuthLayout>
  );
};
