import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { EXPIRED_LINK } from '../../shared/authLink.ts';
import { api } from './api';
import { authLink, supabase } from './supabase';
import { toAppUser, type AppUser, type Profile } from './user';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  user: AppUser | null;
  error: string | null;
  /** Opened from an invitation or password-reset e-mail: the user must set a password before using the hub. */
  passwordSetup: 'invite' | 'recovery' | null;
  /** Why the e-mail link did not work, shown on the login screen. */
  linkError: string | null;
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  requestReset: (email: string) => Promise<void>;
}

export const MIN_PASSWORD = 10;

// A link from the hub's e-mail carries a one-time token: exchange it for a session exactly once (React StrictMode
// runs effects twice, and a second exchange would fail because the token is used up).
async function openLink(): Promise<string | null> {
  if (!supabase || !authLink || authLink.kind === 'error') return null;
  let tokenHash = authLink.tokenHash;
  let type: 'invite' | 'recovery' = authLink.kind;
  if (authLink.linkToken) {
    try {
      ({ tokenHash, type } = await api<{ tokenHash: string; type: 'invite' | 'recovery' }>('/api/auth/accept', { method: 'POST', body: { token: authLink.linkToken } }));
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (!tokenHash) return null;
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  return error ? EXPIRED_LINK : null;
}
const linkVerification = authLink && authLink.kind !== 'error' && (authLink.tokenHash || authLink.linkToken) ? openLink() : null;

// Signing out in one of our apps ends at /logout: the hub signs out too, otherwise it would sign the person straight
// back in to the app (lib/sso.ts). The app has already ended the session everywhere; this clears the hub's copy.
const loggingOut = supabase && window.location.pathname === '/logout' ? supabase.auth.signOut({ scope: 'local' }) : null;
if (loggingOut) window.history.replaceState(null, '', '/');

// Sign-in for the shared user base. Accounts are created, invited and reset here, in the hub (Users).
export const useAuth = create<AuthState>((set, get) => {
  async function loadUser(session: Session | null) {
    if (!session) {
      // The link carried no usable session (already used or expired).
      if (get().passwordSetup) set({ passwordSetup: null, linkError: EXPIRED_LINK });
      set({ status: 'signedOut', session: null, user: null });
      return;
    }
    // Token refreshes fire this again: keep the user we already have.
    const current = get().user;
    if (current && current.id === session.user.id) {
      set({ session, status: 'signedIn' });
      return;
    }
    set({ session });
    // Name, role and apps come straight from `profiles`, as the signed-in user (row level security: own row only).
    const { data, error } = await supabase!.from('profiles').select('full_name, role, apps').eq('id', session.user.id).maybeSingle();
    if (error) {
      set({ status: 'error', error: `Could not load your profile: ${error.message}` });
      return;
    }
    set({ status: 'signedIn', user: toAppUser(session.user, data as Profile | null), error: null });
  }

  return {
    status: 'loading',
    session: null,
    user: null,
    error: null,
    passwordSetup: authLink && authLink.kind !== 'error' ? authLink.kind : null,
    linkError: authLink?.kind === 'error' ? authLink.message : null,
    init: () => {
      if (!supabase) {
        set({ status: 'unconfigured' });
        return () => {};
      }
      const client = supabase;
      let unsubscribe: (() => void) | null = null;
      let stopped = false;
      const listen = () => {
        if (stopped) return;
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') set({ passwordSetup: 'recovery' });
          // Supabase recommends not awaiting inside the callback.
          setTimeout(() => void loadUser(session), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      };
      // Listen only once the link's token is exchanged, so the first state seen is the new session.
      if (linkVerification) {
        void linkVerification.then((error) => {
          if (error) set({ passwordSetup: null, linkError: error });
          listen();
        });
      } else if (loggingOut) {
        void loggingOut.finally(listen);
      } else {
        listen();
      }
      return () => {
        stopped = true;
        unsubscribe?.();
      };
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('The app is not configured.');
      set({ linkError: null });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect e-mail or password.' : error.message);
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      set({ status: 'signedOut', session: null, user: null, passwordSetup: null });
    },
    setPassword: async (password) => {
      if (!supabase) throw new Error('The app is not configured.');
      if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters long.`);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw new Error(error.code === 'same_password' ? 'The new password must be different from the previous one.' : `Could not set the password: ${error.message}`);
      }
      set({ passwordSetup: null });
    },
    requestReset: async (email) => {
      await api('/api/auth/recover', { method: 'POST', body: { email } });
    },
  };
});
