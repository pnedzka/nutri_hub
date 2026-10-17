import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { toAppUser, type AppUser, type Profile } from './user';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  user: AppUser | null;
  error: string | null;
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Sign-in only: accounts are created, invited and reset in the Document neutralizer, which shares this user base.
export const useAuth = create<AuthState>((set, get) => {
  async function loadUser(session: Session | null) {
    if (!session) {
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
    // The hub has no server: the name and the role come straight from `profiles`, as the signed-in user.
    const { data, error } = await supabase!.from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle();
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
    init: () => {
      if (!supabase) {
        set({ status: 'unconfigured' });
        return () => {};
      }
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        // Supabase recommends not awaiting inside the callback.
        setTimeout(() => void loadUser(session), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('The app is not configured.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect e-mail or password.' : error.message);
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      set({ status: 'signedOut', session: null, user: null });
    },
  };
});
