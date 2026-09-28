import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced clearly during dev so a missing .env is obvious.
  console.error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// Resilient auth storage.
//
// The auth session is normally kept in localStorage. But some browsers make
// localStorage unusable — most notably iOS/Safari Private Browsing and, when the
// app is loaded inside a cross-origin iframe, Safari's "Prevent Cross-Site
// Tracking" partitions/blocks it. In those cases the Supabase default storage
// throws, the session never sticks, and the customer is treated as logged-out
// on the next action — which bounces them out of an in-progress booking.
//
// This adapter probes localStorage once. If it works we use it (persists across
// visits, unchanged behavior). If it doesn't, we fall back to an in-memory store
// so the session at least survives for the current page/tab — long enough to
// complete a booking in one sitting instead of being kicked to the login screen.
function createSafeStorage() {
  const memory = new Map();
  let useLocal = false;

  if (typeof window !== 'undefined') {
    try {
      const probe = '__sb_storage_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      useLocal = true;
    } catch {
      useLocal = false;
    }
  }

  const storage = {
    // True when the session will survive a full page reload / return visit.
    persists: useLocal,
    getItem: (key) => {
      if (useLocal) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          /* fall through to memory */
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem: (key, value) => {
      if (useLocal) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {
          /* fall through to memory */
        }
      }
      memory.set(key, value);
    },
    removeItem: (key) => {
      if (useLocal) {
        try {
          window.localStorage.removeItem(key);
          return;
        } catch {
          /* fall through to memory */
        }
      }
      memory.delete(key);
    }
  };

  return storage;
}

const safeStorage = createSafeStorage();

// True if the browser will remember the login across reloads/visits. False in
// private mode or when site data is blocked/partitioned — the UI uses this to
// warn the customer instead of silently logging them out.
export const sessionPersists = safeStorage.persists;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: safeStorage
  }
});
