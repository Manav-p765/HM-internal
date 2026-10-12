import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { Button } from '../common/Button';

export const AuthPage: React.FC = () => {
  const { login, signup, forgotPassword, resetPassword, showToast } = useApp();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-detect invitation token from URL query string if present
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (invite) {
      setInvitationToken(invite);
      setMode('signup');
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    const res = login(email, password);
    setIsLoading(false);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to authenticate');
    }
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    const res = signup(name, email, password, invitationToken || undefined);
    setIsLoading(false);
    if (res.success) {
      setSuccessMessage(res.message || 'Account created successfully!');
      if (!invitationToken) {
        // Pending approval message
        setTimeout(() => setMode('login'), 3500);
      }
    } else {
      setErrorMessage(res.error || 'Registration failed');
    }
  };

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    const res = forgotPassword(email);
    setIsLoading(false);
    if (res.success) {
      if (res.token) {
        setResetToken(res.token);
        setMode('reset');
        setSuccessMessage('Password recovery token generated. You can now set your new password.');
      } else {
        setSuccessMessage('If an account exists with this email address, password recovery instructions have been sent.');
      }
    } else {
      setErrorMessage(res.error || 'Recovery request failed');
    }
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    const res = resetPassword(resetToken, newPassword);
    setIsLoading(false);
    if (res.success) {
      setSuccessMessage('Password updated successfully! Please sign in with your new credentials.');
      setTimeout(() => setMode('login'), 2000);
    } else {
      setErrorMessage(res.error || 'Password reset failed');
    }
  };

  // Quick Demo fill buttons for evaluation convenience
  const handleQuickDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon & Heading */}
        <div className="flex justify-center items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#5038F5] text-white flex items-center justify-center font-bold text-lg shadow-sm">
            M
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-[#111827] leading-none">
              Monks
            </span>
            <span className="text-xs font-medium text-[#7185A5] mt-0.5 leading-none">
              Hybrid Monks Internal System
            </span>
          </div>
        </div>
        <h2 className="text-center text-xl font-bold tracking-tight text-[#111827] mt-4">
          {mode === 'login' && 'Sign in to your workplace'}
          {mode === 'signup' && 'Create employee account'}
          {mode === 'forgot' && 'Reset your password'}
          {mode === 'reset' && 'Set a new password'}
        </h2>
        <p className="text-center text-xs text-[#7185A5] mt-1">
          {mode === 'login' && 'Secure authentication for Hybrid Monks staff & management'}
          {mode === 'signup' && 'Register account or redeem an employee invitation'}
          {mode === 'forgot' && 'Enter your registered work email address'}
          {mode === 'reset' && 'Choose a strong password for your workplace account'}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#DFE6F1] rounded-2xl sm:px-10">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-[#E11D48]/10 border border-[#E11D48]/20 flex items-start gap-2.5 text-xs text-[#E11D48]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-[#047857]/10 border border-[#047857]/20 flex items-start gap-2.5 text-xs text-[#047857]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* VIEW: LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@hybridmonks.com"
                    className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#111827]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-[11px] font-medium text-[#5038F5] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full text-xs pl-9 pr-9 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-[#7185A5] hover:text-[#111827] absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full mt-2"
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Sign in to Portal'}
              </Button>

              {/* Instant Test Accounts Strip */}
              <div className="pt-4 mt-4 border-t border-[#DFE6F1]">
                <span className="text-[10px] font-semibold text-[#7185A5] uppercase tracking-wider block mb-2 text-center">
                  Instant Test Sign-in
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('alex@hybridmonks.com', 'monks@admin2026')}
                    className="p-1.5 rounded-lg border border-[#DFE6F1] hover:border-[#5038F5] hover:bg-[#5038F5]/5 text-center text-[10px] font-medium text-[#111827] transition-all cursor-pointer"
                  >
                    <div className="font-bold text-[#5038F5]">Admin</div>
                    <div className="text-[9px] text-[#7185A5]">Alex Monks</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('priya@hybridmonks.com', 'monks@manager2026')}
                    className="p-1.5 rounded-lg border border-[#DFE6F1] hover:border-[#5038F5] hover:bg-[#5038F5]/5 text-center text-[10px] font-medium text-[#111827] transition-all cursor-pointer"
                  >
                    <div className="font-bold text-[#0284C7]">Manager</div>
                    <div className="text-[9px] text-[#7185A5]">Priya Sharma</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('rahul@hybridmonks.com', 'monks@employee2026')}
                    className="p-1.5 rounded-lg border border-[#DFE6F1] hover:border-[#5038F5] hover:bg-[#5038F5]/5 text-center text-[10px] font-medium text-[#111827] transition-all cursor-pointer"
                  >
                    <div className="font-bold text-[#047857]">Employee</div>
                    <div className="text-[9px] text-[#7185A5]">Rahul Verma</div>
                  </button>
                </div>
              </div>

              <div className="text-center pt-2">
                <span className="text-xs text-[#7185A5]">
                  Have an employee invitation?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="font-semibold text-[#5038F5] hover:underline cursor-pointer"
                  >
                    Activate account
                  </button>
                </span>
              </div>
            </form>
          )}

          {/* VIEW: SIGNUP */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@hybridmonks.com"
                    className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Create Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full text-xs pl-9 pr-9 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-[#7185A5] hover:text-[#111827] absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Invitation Token (Optional)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={invitationToken}
                    onChange={e => setInvitationToken(e.target.value)}
                    placeholder="inv_..."
                    className="w-full text-xs font-mono pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>
                <span className="text-[10px] text-[#7185A5] mt-1 block">
                  Self-registrations without an invitation token will remain pending until Admin approval.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full mt-2"
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Complete Registration'}
              </Button>

              <div className="text-center pt-2">
                <span className="text-xs text-[#7185A5]">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="font-semibold text-[#5038F5] hover:underline cursor-pointer"
                  >
                    Sign in
                  </button>
                </span>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Registered Work Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@hybridmonks.com"
                    className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full mt-2"
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Send Recovery Token'}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className="text-xs font-medium text-[#5038F5] hover:underline cursor-pointer"
                >
                  Back to Sign in
                </button>
              </div>
            </form>
          )}

          {/* VIEW: RESET PASSWORD */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Recovery Token
                </label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  placeholder="pwd_reset_..."
                  className="w-full text-xs font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full mt-2"
                disabled={isLoading}
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs font-medium text-[#5038F5] hover:underline cursor-pointer"
                >
                  Back to Sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
