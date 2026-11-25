// One way for every module to tell people about an event: a notification in the bell (public.notifications) and,
// when the event needs someone to act, an e-mail in the Nutri APEX look (apexMail.ts), one message per person.
// The author of the event never gets it. Failures are logged, not thrown: the request or post is saved either way.

import { KEEP_DAYS, type NotificationModule } from '../../shared/notifications.js';
import { renderApexMail, type ApexMail } from './apexMail.js';
import { logError } from './monitoring.js';
import { db } from './supabase.js';

const FROM = () => process.env.MAIL_FROM?.trim() || 'Nutri APEX <no-reply@nutripartners.co>';

export interface Recipient {
  id: string;
  email: string;
  name: string;
}

export interface Notice {
  module: NotificationModule;
  /** e.g. 'leave.approved' */
  kind: string;
  /** Who gets it; duplicates and the actor are dropped. */
  to: Recipient[];
  /** The person who caused it; never notified. */
  actorId?: string | null;
  /** The bell, in English like the hub. */
  title: string;
  body?: string | null;
  /** A path in the hub, e.g. /leave/approvals. */
  link: string;
  /** An e-mail too (Polish, Nutri APEX); without it only the bell. `name` and the button's url are filled in. */
  email?: (Omit<ApexMail, 'name' | 'button'> & { button: string }) | null;
  /** Only these people (ids) get the e-mail; the rest of `to` gets only the bell. Without it everyone gets both. */
  emailTo?: readonly string[] | null;
}

/** The recipients without the actor and duplicates (by id). */
export function recipientsOf(notice: Pick<Notice, 'to' | 'actorId'>): Recipient[] {
  const seen = new Set<string>();
  return notice.to.filter((r) => {
    if (!r.id || r.id === notice.actorId || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** Saves the notifications and sends the e-mails. `baseUrl` is the hub's address (appUrl(request)). */
export async function notify(baseUrl: string, notice: Notice): Promise<void> {
  const to = recipientsOf(notice);
  if (!to.length) return;
  const rows = to.map((r) => ({
    user_id: r.id,
    module: notice.module,
    kind: notice.kind,
    title: notice.title.slice(0, 200),
    body: notice.body?.slice(0, 1000) ?? null,
    link: notice.link,
    actor_id: notice.actorId ?? null,
  }));
  try {
    const { error } = await db().from('notifications').insert(rows);
    if (error) throw error;
    // Old ones of these people go (KEEP_DAYS); cheap thanks to the (user_id, created_at) index.
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    const { error: cleanError } = await db().from('notifications').delete().in('user_id', to.map((r) => r.id)).lt('created_at', cutoff);
    if (cleanError) throw cleanError;
  } catch (error) {
    logError('notifications', error, { kind: notice.kind });
  }

  if (notice.email) {
    const { button, ...mail } = notice.email;
    const url = `${baseUrl}${notice.link}`;
    await sendEach(
      to.filter((r) => r.email && (!notice.emailTo || notice.emailTo.includes(r.id))).map((r) => ({ to: r.email, ...renderApexMail({ ...mail, name: r.name, button: { label: button, url } }) })),
      notice.module,
    );
  }
}

/** Each e-mail with its own recipient, in Resend batches of 100. */
async function sendEach(mails: { to: string; subject: string; html: string; text: string }[], tag: string): Promise<void> {
  if (!mails.length) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logError('mail', new Error('RESEND_API_KEY is missing; e-mail not sent'), { subject: mails[0].subject });
    return;
  }
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(chunk.map((m) => ({ from: FROM(), to: [m.to], subject: m.subject, html: m.html, text: m.text, tags: [{ name: 'type', value: tag }] }))),
      });
      if (!res.ok) logError('mail', new Error(`Resend answered ${res.status} (batch)`), { detail: await res.text().catch(() => '') });
    } catch (error) {
      logError('mail', error);
    }
  }
}

/** Recipients by e-mail (modules that know people by e-mail, e.g. the Contract generator). */
export async function recipientsByEmail(emails: string[]): Promise<Recipient[]> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length) return [];
  const { data, error } = await db().from('profiles').select('id, email, full_name').is('deactivated_at', null);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => wanted.includes(String(row.email ?? '').toLowerCase()))
    .map((row) => ({ id: String(row.id), email: String(row.email), name: (row.full_name as string | null)?.trim() || String(row.email) }));
}
