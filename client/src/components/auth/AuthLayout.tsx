import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';

export const MIN_PASSWORD_LENGTH = 10;

// Returns a message when the new password can't be submitted, otherwise null. Mirrors the server policy.
// Passwords are never trimmed: spaces anywhere are valid and count towards the length.
export function checkNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters (spaces count).`;
  if (password.trim() === '') return 'Password cannot be only spaces.';
  if (password !== confirmation) return 'The two passwords do not match.';
  return null;
}

// A rough hint only (never blocks submission beyond the policy above): length and variety.
export function passwordStrength(password: string): { label: 'Too short' | 'Weak' | 'Fair' | 'Strong'; score: 0 | 1 | 2 | 3 } {
  if (password.length < MIN_PASSWORD_LENGTH || password.trim() === '') return { label: 'Too short', score: 0 };
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(password)).length;
  if (password.length >= 16 && kinds >= 2) return { label: 'Strong', score: 3 };
  if (password.length >= 12 || kinds >= 3) return { label: 'Fair', score: 2 };
  return { label: 'Weak', score: 1 };
}

export const PasswordStrengthHint: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const { label, score } = passwordStrength(password);
  const colour = ['bg-[#E11D48]', 'bg-[#F59E0B]', 'bg-[#5038F5]', 'bg-[#047857]'][score];
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map(i => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= score ? colour : 'bg-[#DFE6F1]'}`} />
        ))}
      </div>
      <span className="text-[11px] text-[#7185A5] w-16 text-right">{label}</span>
    </div>
  );
};

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  error?: string;
  success?: string;
  children: React.ReactNode;
}

// Centered card with the brand header, shared by every signed-out screen.
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, error, success, children }) => (
  <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      <div className="flex justify-center items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#5038F5] text-white flex items-center justify-center font-bold text-lg shadow-sm">
          M
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-[#111827] leading-none">Monks</span>
          <span className="text-xs font-medium text-[#7185A5] mt-0.5 leading-none">
            Hybrid Monks Internal System
          </span>
        </div>
      </div>
      <h2 className="text-center text-xl font-bold tracking-tight text-[#111827] mt-4">{title}</h2>
      <p className="text-center text-xs text-[#7185A5] mt-1">{subtitle}</p>
    </div>

    <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
      <div className="bg-white py-8 px-6 shadow-sm border border-[#DFE6F1] rounded-2xl sm:px-10">
        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 flex items-start gap-2.5 text-xs text-[#E11D48]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" className="mb-4 p-3 rounded-lg bg-[#047857]/10 border border-[#047857]/20 flex items-start gap-2.5 text-xs text-[#047857]">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  </div>
);

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  labelAction?: React.ReactNode;
  showStrength?: boolean;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({ id, label, value, onChange, autoComplete, hint, labelAction, showStrength }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="block text-xs font-semibold text-[#111827]">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <Lock className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          // The value is used exactly as typed: no capitalisation, correction or trimming, here or on the server.
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full text-xs pl-9 pr-9 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="p-1 text-[#7185A5] hover:text-[#111827] absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {showStrength && <PasswordStrengthHint password={value} />}
      {hint && <p className="text-[11px] text-[#7185A5] mt-1">{hint}</p>}
    </div>
  );
};
