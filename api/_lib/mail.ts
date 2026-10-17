// Account e-mails (invitation, password reset), sent through the Resend API. The sender is Nutri APEX, the company's
// AI assistant; the message says clearly that it concerns the Nutri Partners apps. Links come from accountLinks.ts.

import { APP_NAMES, type AppId } from '../../shared/access.js';
import { LINK_VALIDITY_HOURS, type AccountLinkKind } from './accountLinks.js';
import { HttpError } from './http.js';

const FROM = () => process.env.MAIL_FROM?.trim() || 'Nutri APEX <no-reply@nutripartners.co>';
const SYSTEM = 'Nutri Partners apps';
const ACCENT = '#a50029';
const COMPANY = 'Nutri Partners Sp. z o.o. · Prof. Ludwika Chmaja 6 str., 35-021 Rzeszów, Poland';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hours = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);

export interface AccountMail {
  kind: AccountLinkKind;
  email: string;
  url: string;
  appUrl: string;
  /** Who sent the invitation (administrator's name or e-mail). */
  invitedBy?: string | null;
  /** The apps the invitation opens; "all" for an administrator. */
  apps?: AppId[] | 'all';
}

function appList(apps: AccountMail['apps']): string | null {
  if (apps === 'all') return 'all apps (administrator)';
  return apps?.length ? apps.map((id) => APP_NAMES[id]).join(', ') : null;
}

export function accountMessage({ kind, email, url, appUrl, invitedBy, apps }: AccountMail) {
  const invite = kind === 'invite';
  const validity = hours(LINK_VALIDITY_HOURS[kind]);
  const subject = invite ? 'Invitation to the Nutri Partners apps' : `${SYSTEM}: set a new password`;
  const paragraphs = invite
    ? [
        `Hello,`,
        `I'm Nutri APEX, the AI assistant of Nutri Partners. You're invited to the ${SYSTEM}: one sign-in for the company's tools.`,
        `Set your password with the button below. After signing in you'll see the apps you can use.`,
      ]
    : [`Hello,`, `I'm Nutri APEX, the AI assistant of Nutri Partners. I've received a request to set a new password for your account in the ${SYSTEM}.`];
  const button = invite ? 'Set your password and sign in' : 'Set a new password';
  const after = invite
    ? `The link is valid for ${validity} and works once. If it expires, click "Forgot password?" on the sign-in page and enter your address, or ask your administrator for a new invitation.`
    : `The link is valid for ${validity} and works once. If you didn't ask to change your password, ignore this message – your password won't change.`;
  const signature = `This message was sent automatically by Nutri APEX, the AI assistant of Nutri Partners, on behalf of the ${SYSTEM}. Please do not reply.`;
  const list = invite ? appList(apps) : null;

  const text = [
    ...paragraphs,
    '',
    `Address: ${appUrl}`,
    `Your login: ${email}`,
    ...(list ? [`Your apps: ${list}`] : []),
    ...(invite && invitedBy ? [`Invited by: ${invitedBy}`] : []),
    '',
    `${button}: ${url}`,
    '',
    after,
    '',
    '—',
    signature,
    COMPANY,
  ].join('\n');

  const p = (s: string) => `<p style="margin-top:0;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;">${s}</p>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5;"><tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-top:4px solid ${ACCENT};">
<tr><td style="padding-top:26px;padding-bottom:4px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${ACCENT};">Nutri Partners · ${escape(invite ? 'Invitation' : 'Password reset')}</td></tr>
<tr><td style="padding-top:2px;padding-bottom:18px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#1a1a1a;">${escape(SYSTEM)}</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;">
${paragraphs.map((t) => p(escape(t))).join('\n')}
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f7" style="background-color:#f6f6f7;"><tr><td style="padding-top:12px;padding-bottom:12px;padding-left:16px;padding-right:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1a1a1a;">
Address: <a href="${escape(appUrl)}" style="color:${ACCENT};">${escape(appUrl.replace(/^https?:\/\//, ''))}</a><br>
Your login: <strong>${escape(email)}</strong>${list ? `<br>
Your apps: ${escape(list)}` : ''}${invite && invitedBy ? `<br>
Invited by: ${escape(invitedBy)}` : ''}
</td></tr></table>
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${ACCENT}" style="background-color:${ACCENT};padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;"><a href="${escape(url)}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(button)}</a></td>
</tr></table></td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:10px;">${escape(after)}</p>
<p style="margin-top:0;margin-bottom:0;">If the button doesn't work, copy this address into your browser:<br><a href="${escape(url)}" style="color:${ACCENT};word-break:break-all;">${escape(url)}</a></p>
</td></tr>
<tr><td style="padding-top:14px;padding-bottom:16px;padding-left:32px;padding-right:32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:17px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:6px;"><strong style="color:#1a1a1a;">Nutri APEX</strong> · AI assistant of Nutri Partners</p>
<p style="margin-top:0;margin-bottom:6px;">${escape(signature)}</p>
<p style="margin-top:0;margin-bottom:0;">${escape(COMPANY)}</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, html, text };
}

/** Sends the account e-mail through Resend. Throws an HttpError with a message for the user. */
export async function sendAccountMail(mail: AccountMail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(500, 'Sending e-mails is not configured (RESEND_API_KEY is missing).');
  const { subject, html, text } = accountMessage(mail);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [mail.email], subject, html, text, tags: [{ name: 'type', value: mail.kind }] }),
    });
  } catch (error) {
    console.error('[mail] network', error);
    throw new HttpError(502, 'Could not connect to the mail server. Try again.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[mail] resend', res.status, detail);
    throw new HttpError(502, `The mail server rejected the message (${res.status}). Try again later.`);
  }
}
