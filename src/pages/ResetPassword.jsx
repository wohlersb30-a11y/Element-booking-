import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const LOGO_URL =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg';

// Landing page for the password-reset email link. Supabase puts a short-lived
// recovery session in the URL (detectSessionInUrl), so by the time we render the
// customer is authenticated just long enough to set a new password.
export default function ResetPassword() {
  const { updatePassword } = useAuth();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    // The recovery session may land via the URL fragment a tick after mount.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setHasSession(Boolean(data?.session));
      setReady(true);
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      if (session) setHasSession(true);
      setReady(true);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
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
      await updatePassword(password);
      setDone(true);
      // Send them to the app shortly after; their session is now fully valid.
      setTimeout(() => window.location.assign('/'), 1800);
    } catch (err) {
      setError(err.message || 'Could not update your password. The link may have expired.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <img src={LOGO_URL} alt="Element Indoor Golf" className="mx-auto h-16 w-auto object-contain" />
          <p className="text-slate-500 text-sm">Set a new password</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {done ? (
            <Alert className="border-emerald-200 bg-emerald-50">
              <AlertDescription className="text-emerald-800">
                Password updated! Taking you to the app…
              </AlertDescription>
            </Alert>
          ) : ready && !hasSession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">
                This reset link is invalid or has expired. Please request a new one
                from the sign-in screen.
              </p>
              <Button className="w-full" onClick={() => window.location.assign('/Login')}>
                Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
