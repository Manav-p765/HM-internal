import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';

export const MIN_PASSWORD_LENGTH = 10;

// Returns a message when the new password can't be submitted, otherwise null.
export function checkNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirmation) return 'The two passwords do not match.';
  return null;
}

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
}

export const PasswordField: React.FC<PasswordFieldProps> = ({ id, label, value, onChange, autoComplete, hint, labelAction }) => {
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
      {hint && <p className="text-[11px] text-[#7185A5] mt-1">{hint}</p>}
    </div>
  );
};
