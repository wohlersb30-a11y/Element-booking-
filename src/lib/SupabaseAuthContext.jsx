import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

// Supabase-backed replacement for the Base44 AuthContext. Keeps the same
// surface App.jsx already consumes (isLoadingAuth, isLoadingPublicSettings,
// authError, navigateToLogin) and adds user/isAdmin/login/signup/logout.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  // True once the profile (and thus the real role) has been resolved, so the
  // admin gate never decides before the role is known.
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    // Apply auth state synchronously from the session. IMPORTANT: do NOT await
    // Supabase DB calls here — running them inside onAuthStateChange deadlocks
    // the auth lock and the app hangs on the spinner. We set the user from the
    // session immediately, then fetch the profile role separately.
    const applySession = (session) => {
      if (!active) return;
      const sessionUser = session?.user ?? null;

      if (!sessionUser) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        setProfileLoaded(true);
        return;
      }

      setUser({
        id: sessionUser.id,
        email: sessionUser.email,
        full_name: sessionUser.user_metadata?.full_name || '',
        phone: '',
        role: 'customer' // refined by fetchProfileRole() below
      });
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
      fetchProfileRole(sessionUser.id);
    };

    // Separate, non-blocking profile fetch (runs outside the auth callback).
    const fetchProfileRole = async (userId) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone, role')
          .eq('id', userId)
          .single();
        if (!active) return;
        if (profile) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  full_name: profile.full_name || prev.full_name,
                  phone: profile.phone || '',
                  role: profile.role || 'customer'
                }
              : prev
          );
        }
      } catch {
        // Non-fatal: keep the default 'customer' role.
      } finally {
        if (active) setProfileLoaded(true);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Defer out of the auth callback to avoid the deadlock footgun.
        setTimeout(() => applySession(session), 0);
      }
    );

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signup = async (email, password, fullName, phone) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone: phone || '' } }
    });
    if (error) throw error;
  };

  // Returns 'account' | 'legacy' | 'new' for an email, so the entry screen can
  // route returning customers to "complete your one-time registration".
  const checkEmail = async (email) => {
    const { data, error } = await supabase.rpc('email_status', { p_email: email });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/Login')) {
      window.location.assign('/Login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false, // kept for API compatibility with App.jsx
        authError,
        isAdmin: user?.role === 'admin',
        profileLoaded,
        login,
        signup,
        checkEmail,
        logout,
        navigateToLogin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
