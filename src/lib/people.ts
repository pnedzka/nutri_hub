import { create } from 'zustand';
import type { Office, TeamMember } from '../../shared/profile.ts';
import { api } from './api';

interface PeopleState {
  people: TeamMember[] | null;
  offices: Office[];
  /** Id of the signed-in person. */
  me: string | null;
  error: string | null;
  /** Loads Team once (again with `force`), e.g. for the photo in the header. */
  load: (force?: boolean) => Promise<void>;
  /** Puts a saved profile into the list, so the header and Team show it at once. */
  setPerson: (person: TeamMember) => void;
  setOffices: (offices: Office[]) => void;
}

let loading: Promise<void> | null = null;

// Everyone in Team (GET /api/people) and the offices; the signed-in person's own profile is one of them.
export const usePeople = create<PeopleState>((set, get) => ({
  people: null,
  offices: [],
  me: null,
  error: null,
  load: (force = false) => {
    if (loading) return loading;
    if (get().people && !force) return Promise.resolve();
    loading = api<{ people: TeamMember[]; offices: Office[]; me: string }>('/api/people')
      .then(({ people, offices, me }) => set({ people, offices, me, error: null }))
      .catch((e: Error) => set({ error: e.message }))
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  setPerson: (person) => set((s) => ({ people: s.people?.map((p) => (p.id === person.id ? person : p)) ?? s.people })),
  setOffices: (offices) => set({ offices }),
}));

/** The signed-in person's profile from Team, once loaded. */
export const useMyProfile = () => usePeople((s) => s.people?.find((p) => p.id === s.me) ?? null);
