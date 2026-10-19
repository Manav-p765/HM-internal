import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Link2Off } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth';
import { ApiError, errorMessage } from '../../api/client';
import { Button } from '../common/Button';
import { AuthLayout, PasswordField, MIN_PASSWORD_LENGTH, checkNewPassword } from './AuthLayout';

type LinkState =
  | { kind: 'checking' }
  | { kind: 'ready'; email: string; purpose: 'invite' | 'reset' }
  | { kind: 'invalid' };

// The token is read once from the address bar when the page opens (also from the old /reset-password links).
const readToken = () => new URLSearchParams(window.location.search).get('token') ?? '';

// Opened from an emailed invite or reset link: /set-password?token=...
// The token is taken out of the address bar straight away (it never stays in history, bookmarks or a Referer)
// and kept only in memory. The page checks the link, then lets the user choose a password and signs them in.
export const SetPasswordPage: React.FC = () => {
  const { setPasswordFromLink } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [link, setLink] = useState<LinkState>(token ? { kind: 'checking' } : { kind: 'invalid' });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Strip ?token= from the address bar (a replace, so the URL with the token is not in history either).
  useEffect(() => {
    if (window.location.search) navigate(window.location.pathname === '/reset-password' ? '/set-password' : window.location.pathname, { replace: true });
  }, [navigate]);

  // No Referer at all while this page is open (belt and braces: the token is already out of the URL).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .checkSetPasswordLink(token)
      .then(r => !cancelled && setLink({ kind: 'ready', email: r.email, purpose: r.purpose }))
      .catch(err => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'LINK_INVALID') setLink({ kind: 'invalid' });
        else {
          setLink({ kind: 'invalid' });
          setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await setPasswordFromLink(token, password); // sent exactly as typed
      navigate('/dashboard', { replace: true }); // client users are sent on to /portal by the guards
    } catch (err) {
      setIsSaving(false);
      if (err instanceof ApiError && err.code === 'LINK_INVALID') setLink({ kind: 'invalid' });
      setError(errorMessage(err));
    }
  };

  if (link.kind === 'checking') {
    return (
      <AuthLayout title="Set your password" subtitle="Checking your link...">
        <p className="text-xs text-[#7185A5] text-center" role="status">
          One moment...
        </p>
      </AuthLayout>
    );
  }

  if (link.kind === 'invalid') {
    return (
      <AuthLayout title="This link can't be used" subtitle="It may have expired, already been used, or been replaced by a newer one" error={error}>
        <div className="space-y-4 text-xs text-[#475569]">
          <div className="flex justify-center">
            <div className="w-11 h-11 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center">
              <Link2Off className="w-5 h-5" />
            </div>
          </div>
          <p>Each link works once. Invite links expire after 72 hours and password reset links after 1 hour; sending a new link makes the older one stop working.</p>
          <p>
            <span className="font-semibold text-[#111827]">New account?</span> Ask your administrator to resend your invite.
            <br />
            <span className="font-semibold text-[#111827]">Already have a password?</span> Use "Forgot password?" on the sign-in page to get a new reset link.
          </p>
          <Button variant="primary" size="md" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={link.purpose === 'invite' ? 'Set your password' : 'Choose a new password'}
      subtitle={`For ${link.email}`}
      error={error}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
        <PasswordField
          id="set-new-password"
          label="New Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Spaces are allowed and count.`}
        />
        <PasswordField
          id="set-confirm-password"
          label="Repeat New Password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <Button type="submit" variant="primary" size="md" className="w-full mt-2" disabled={isSaving}>
          {isSaving ? 'Saving...' : link.purpose === 'invite' ? 'Set password and sign in' : 'Save password and sign in'}
        </Button>
        <p className="text-[11px] text-[#7185A5] text-center">This link works once. You will be signed in on this device and signed out everywhere else.</p>
      </form>
    </AuthLayout>
  );
};
