import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';

const LOGO_URL =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg';

// Dedicated STAFF / ADMIN entrance (reachable at /admin and /Admin). Unlike the
// customer sign-in — which lands on the "Book a Simulator" page — signing in
// here sends an admin STRAIGHT to the Admin Home hub. A non-admin account is
// told this is the staff area and offered a sign-out so the right person can
// log in on a shared/on-site laptop.
export default function AdminLogin() {
  const {
    login,
    resetPassword,
    logout,
    isLoadingAuth,
    isAuthenticated,
    profileLoaded,
    isAdmin
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Resolving the session / role — show a spinner rather than flashing the form
  // or a premature "not an admin" message.
  if (isLoadingAuth || (isAuthenticated && !profileLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Already signed in as an admin -> straight to the Admin Home hub.
  if (isAuthenticated && isAdmin) {
    return <Navigate to="/Admin" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Full-page redirect to the admin hub. AdminRoute re-resolves the role
      // cleanly on load: an admin sees the hub, anyone else gets a clear
      // "not an admin" screen with a sign-out. Keep the spinner up until then.
      window.location.assign('/Admin');
    } catch (err) {
      setError(err.message || 'Sign in failed. Check the email and password.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
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

  // Signed in, but NOT an admin (e.g. a customer account already logged in on
  // this on-site laptop). Offer a sign-out so an admin can take over.
  if (isAuthenticated && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="text-center space-y-4 bg-gradient-to-r from-[#2d5567] to-[#1e3a47] px-6 py-8">
            <div className="mx-auto w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <p className="text-blue-50 text-sm font-bold tracking-wide">STAFF &amp; ADMIN AREA</p>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-center">
            <p className="text-slate-700">
              This device is signed in to a customer account, which doesn’t have
              admin access. Sign out, then sign back in with a staff/admin
              account.
            </p>
            <Button
              onClick={logout}
              className="w-full h-11 font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29]"
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not signed in -> the admin sign-in form.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 rounded-2xl overflow-hidden">
        <CardHeader className="text-center space-y-4 bg-gradient-to-r from-[#2d5567] to-[#1e3a47] px-6 py-8">
          <img
            src={LOGO_URL}
            alt="Element Indoor Golf"
            className="mx-auto h-16 w-auto object-contain bg-white rounded-xl p-2"
          />
          <div className="flex items-center justify-center gap-2 text-white">
            <Shield className="w-5 h-5" />
            <span className="font-bold tracking-wide">STAFF &amp; ADMIN SIGN IN</span>
          </div>
          <p className="text-blue-50 text-sm">Sign in with your admin account</p>
        </CardHeader>
        <CardContent className="p-6">
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

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29]"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In to Admin'}
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full text-sm font-medium text-[#2d5567] hover:underline"
            >
              Forgot password?
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Here to book a bay?{' '}
            <a href="/Login" className="underline hover:text-slate-600">
              Go to customer sign-in
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
