// Notifications of sales contests (README "Powiadomienia", C1 and C4). The builders are pure (tested in
// notifications.test.ts); the functions below them read people and send through notify().
//   C1: a contest is set (or someone is added to it) → its participants, bell + e-mail.
//   C4: a contest has ended → each participant their place, administrators the winner; bell only, from the daily run.

import { contestStatus, todayInPoland, type Contest, type ContestResult } from '../../shared/contest.js';
import { formatRange } from '../../shared/leave.js';
import { contestResult } from './contests.js';
import { plRange } from './leaveNotices.js';
import { notify, type Notice, type Recipient } from './notifications.js';
import { db } from './supabase.js';

const FINISHED = 'contests.finished';
/** Participants open the home page widget; the id in the link also marks that C4 was sent for this contest. */
const homeLink = (id: string) => `/?contest=${id}`;
const adminLink = (id: string) => `/contests?id=${id}`;

const scoring = (c: Contest) =>
  c.weightCount === 100 ? 'liczba kontraktów' : c.weightCount === 0 ? 'wartość kontraktów w EUR' : `${c.weightCount}% liczba kontraktów, ${100 - c.weightCount}% ich wartość w EUR`;

/** C1: the participants of a new contest, or the people just added to one. */
export function contestAnnounced(contest: Contest, to: Recipient[], admin: Recipient): Notice | null {
  if (!to.length) return null;
  const range = formatRange(contest.startsOn, contest.endsOn);
  return {
    module: 'contests',
    kind: 'contests.started',
    to,
    actorId: admin.id,
    title: `You take part in a sales contest: ${contest.name}`,
    body: `${range}.${contest.prize ? ` Prize: ${contest.prize}` : ''}`,
    link: homeLink(contest.id),
    email: {
      module: 'Konkursy',
      title: `Nowy konkurs sprzedażowy: ${contest.name}`,
      lead: `${admin.name} dodał(a) Cię do konkursu sprzedażowego „${contest.name}”. Liczą się kontrakty zawarte w terminie konkursu.`,
      details: [
        ['Termin', plRange(contest.startsOn, contest.endsOn)],
        ...(contest.prize ? ([['Nagroda', contest.prize]] as [string, string][]) : []),
        ['Co się liczy', scoring(contest)],
      ],
      button: 'Zobacz ranking',
    },
  };
}

/** C4: each participant gets their place; administrators get the winner. */
export function contestFinished(result: ContestResult, participants: Recipient[], admins: Recipient[]): Notice[] {
  const { contest, entries } = result;
  const winner = result.leader ? entries[0] : null;
  const winnerText = winner ? `Winner: ${winner.name} (${winner.contracts} ${winner.contracts === 1 ? 'contract' : 'contracts'}).` : 'Nobody had contracts in it.';
  const place = new Map(entries.map((e, i) => [e.id, i + 1]));
  const notices: Notice[] = participants
    .filter((p) => place.has(p.id))
    .map((p) => {
      const mine = place.get(p.id)!;
      const won = winner?.id === p.id;
      return {
        module: 'contests',
        kind: FINISHED,
        to: [p],
        title: won ? `You won the contest ${contest.name}!` : `${contest.name} has ended: you placed ${mine} of ${entries.length}`,
        body: won ? (contest.prize ? `Prize: ${contest.prize}` : 'Congratulations!') : winnerText,
        link: homeLink(contest.id),
      };
    });
  const others = admins.filter((a) => !place.has(a.id));
  if (others.length) notices.push({ module: 'contests', kind: FINISHED, to: others, title: `The contest ${contest.name} has ended`, body: winnerText, link: adminLink(contest.id) });
  return notices;
}

async function recipientsById(ids: string[]): Promise<Recipient[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from('profiles').select('id, email, full_name').in('id', ids).is('deactivated_at', null);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.email)
    .map((row) => ({ id: String(row.id), email: String(row.email), name: (row.full_name as string | null)?.trim() || String(row.email) }));
}

/** After an administrator saved a contest: C1 to the participants that were not in it before (all, for a new one). */
export async function announceContest(baseUrl: string, contest: Contest, before: string[], adminId: string): Promise<void> {
  if (contestStatus(contest, todayInPoland()) === 'finished') return;
  const added = contest.participantIds.filter((id) => !before.includes(id));
  const [people, [admin]] = await Promise.all([recipientsById(added), recipientsById([adminId])]);
  const notice = contestAnnounced(contest, people, admin ?? { id: adminId, email: '', name: 'An administrator' });
  if (notice) await notify(baseUrl, notice);
}

/** Daily run: C4 for contests that ended in the last 7 days and were not announced yet. */
export async function finishContests(baseUrl: string, contests: Contest[]): Promise<number> {
  let sent = 0;
  for (const contest of contests) {
    const { count, error } = await db().from('notifications').select('id', { count: 'exact', head: true }).eq('kind', FINISHED).in('link', [homeLink(contest.id), adminLink(contest.id)]);
    if (error) throw error;
    if (count) continue;
    const { data: adminRows, error: adminError } = await db().from('profiles').select('id').eq('role', 'admin');
    if (adminError) throw adminError;
    const [result, participants, admins] = await Promise.all([
      contestResult(contest, { id: '', isAdmin: false }),
      recipientsById(contest.participantIds),
      recipientsById((adminRows ?? []).map((r) => String(r.id))),
    ]);
    for (const notice of contestFinished(result, participants, admins)) await notify(baseUrl, notice);
    sent++;
  }
  return sent;
}
