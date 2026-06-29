import React, { useState } from 'react';
import { useAuth } from '@/lib/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const LOGO_URL =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg';

// Email-first entry screen. The customer types their email and we route them:
//   account -> sign in
//   legacy  -> "complete your one-time registration" (returning customer)
//   new     -> create a new account
export default function Login() {
  const { login, signup, checkEmail, resetPassword } = useAuth();

  const [step, setStep] = useState('email'); // email | login | claim | signup
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const goBackToEmail = () => {
    resetMessages();
    setPassword('');
    setConfirm('');
    setStep('email');
  };

  const handleEmailContinue = async (e) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const status = await checkEmail(email.trim());
      if (status === 'account') setStep('login');
      else if (status === 'legacy') setStep('claim');
      else setStep('signup');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      await login(email.trim(), password);
      window.location.assign('/');
    } catch (err) {
      setError(err.message || 'Sign in failed');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email.trim()) {
      setError('Enter your email above first, then tap “Forgot password?”.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setInfo(
        `We’ve emailed a password reset link to ${email.trim()}. Open it to set a new password. (Check spam if you don’t see it shortly.)`
      );
    } catch (err) {
      setError(err.message || 'Could not send the reset email. Please try again.');
    }
    setLoading(false);
  };

  // Used for both "claim" (returning customer) and "signup" (new customer).
  const handleCreate = async (e) => {
    e.preventDefault();
    resetMessages();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim(), password, fullName.trim(), phone.trim());
      // Auto sign-in (works when email confirmation is disabled in Supabase).
      try {
        await login(email.trim(), password);
        window.location.assign('/');
      } catch {
        setInfo('Account created! Please check your email to confirm, then sign in.');
        setPassword('');
        setConfirm('');
        setStep('login');
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Could not create your account.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <img
            src={LOGO_URL}
            alt="Element Indoor Golf"
            className="mx-auto h-16 w-auto object-contain"
          />
          <p className="text-slate-500 text-sm">
            {step === 'email' && 'Book your bay — enter your email to get started'}
            {step === 'login' && 'Welcome back! Enter your password to sign in'}
            {step === 'claim' && "Welcome back! Let's finish setting up your account"}
            {step === 'signup' && 'Create your account to book'}
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert className="mb-4 border-emerald-200 bg-emerald-50">
              <AlertDescription className="text-emerald-800">{info}</AlertDescription>
            </Alert>
          )}

          {/* STEP 1: email */}
          {step === 'email' && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </Button>
            </form>
          )}

          {/* STEP 2a: existing account -> sign in */}
          {step === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-slate-500 text-xs">Email</Label>
                <p className="text-sm font-medium text-slate-800">{email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full text-sm font-medium text-[#2d5567] hover:underline"
              >
                Forgot password?
              </button>
              <button type="button" onClick={goBackToEmail} className="w-full text-sm text-slate-500 hover:underline">
                Use a different email
              </button>
            </form>
          )}

          {/* STEP 2b: returning customer -> complete one-time registration */}
          {step === 'claim' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                We found your account from before. Just set a password to complete your
                <strong> one-time registration</strong> — your details are already on file.
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500 text-xs">Email</Label>
                <p className="text-sm font-medium text-slate-800">{email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-claim">Phone (optional — update if it changed)</Label>
                <Input
                  id="phone-claim"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-claim">Create a password</Label>
                <Input
                  id="password-claim"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-claim">Confirm password</Label>
                <Input
                  id="confirm-claim"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Setting up…' : 'Complete Registration'}
              </Button>
              <button type="button" onClick={goBackToEmail} className="w-full text-sm text-slate-500 hover:underline">
                Use a different email
              </button>
            </form>
          )}

          {/* STEP 2c: brand-new customer -> create account */}
          {step === 'signup' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-slate-500 text-xs">Email</Label>
                <p className="text-sm font-medium text-slate-800">{email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-signup">Full name</Label>
                <Input
                  id="name-signup"
                  type="text"
                  autoComplete="name"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-signup">Phone</Label>
                <Input
                  id="phone-signup"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-signup">Create a password</Label>
                <Input
                  id="password-signup"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-signup">Confirm password</Label>
                <Input
                  id="confirm-signup"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating…' : 'Create Account'}
              </Button>
              <button type="button" onClick={goBackToEmail} className="w-full text-sm text-slate-500 hover:underline">
                Use a different email
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
