// Notifications of the hub's modules (Leave, News), sent through the Resend API like the account e-mails (mail.ts: same
// sender, Nutri APEX, and layout). Without RESEND_API_KEY nothing is sent: the data is saved and people see it in the hub.

const FROM = () => process.env.MAIL_FROM?.trim() || 'Nutri APEX <no-reply@nutripartners.co>';
const ACCENT = '#a50029';
const COMPANY = 'Nutri Partners Sp. z o.o. · Prof. Ludwika Chmaja 6 str., 35-021 Rzeszów, Poland';
const SIGNATURE = 'This message was sent automatically by Nutri APEX, the AI assistant of Nutri Partners, on behalf of the Nutri Partners apps. Please do not reply.';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface NoticeMail {
  to: string[];
  /** Small label above the title, e.g. "Leave request". */
  label: string;
  subject: string;
  paragraphs: string[];
  /** Label–value lines in a grey box. */
  details: [string, string][];
  button: { label: string; url: string };
}

export function renderMail({ label, subject, paragraphs, details, button }: NoticeMail) {
  const text = [
    ...paragraphs,
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    '',
    `${button.label}: ${button.url}`,
    '',
    '—',
    SIGNATURE,
    COMPANY,
  ].join('\n');
  const p = (s: string) => `<p style="margin-top:0;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;">${s}</p>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5;"><tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-top:4px solid ${ACCENT};">
<tr><td style="padding-top:26px;padding-bottom:4px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${ACCENT};">Nutri Partners · ${escape(label)}</td></tr>
<tr><td style="padding-top:2px;padding-bottom:18px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#1a1a1a;">Nutri Partners apps</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;">
${paragraphs.map((t) => p(escape(t))).join('\n')}
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f7" style="background-color:#f6f6f7;"><tr><td style="padding-top:12px;padding-bottom:12px;padding-left:16px;padding-right:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1a1a1a;">
${details.map(([k, v]) => `${escape(k)}: <strong>${escape(v)}</strong>`).join('<br>\n')}
</td></tr></table>
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:24px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${ACCENT}" style="background-color:${ACCENT};padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;"><a href="${escape(button.url)}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(button.label)}</a></td>
</tr></table></td></tr>
<tr><td style="padding-top:14px;padding-bottom:16px;padding-left:32px;padding-right:32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:17px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:6px;"><strong style="color:#1a1a1a;">Nutri APEX</strong> · AI assistant of Nutri Partners</p>
<p style="margin-top:0;margin-bottom:6px;">${escape(SIGNATURE)}</p>
<p style="margin-top:0;margin-bottom:0;">${escape(COMPANY)}</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { html, text };
}

/** Sends the e-mail; a failure is logged, not thrown (the leave request or post is saved either way). */
export async function sendMail(mail: NoticeMail, tag = 'leave'): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = [...new Set(mail.to.filter(Boolean))];
  if (!key || !to.length) {
    if (!key) console.warn('[mail] RESEND_API_KEY is missing; not sent:', mail.subject);
    return false;
  }
  const { html, text } = renderMail(mail);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to, subject: mail.subject, html, text, tags: [{ name: 'type', value: tag }] }),
    });
    if (!res.ok) {
      console.error('[mail] resend', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (error) {
    console.error('[mail] network', error);
    return false;
  }
}

/**
 * Sends the same e-mail to many people separately (Resend batch, 100 per call), so nobody sees the other addresses.
 * Failures are logged, not thrown.
 */
export async function sendToEach(recipients: string[], mail: Omit<NoticeMail, 'to'>, tag = 'news'): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  const to = [...new Set(recipients.filter(Boolean))];
  if (!key || !to.length) {
    if (!key) console.warn('[mail] RESEND_API_KEY is missing; not sent:', mail.subject);
    return 0;
  }
  const { html, text } = renderMail({ ...mail, to });
  let sent = 0;
  for (let i = 0; i < to.length; i += 100) {
    const chunk = to.slice(i, i + 100);
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(chunk.map((address) => ({ from: FROM(), to: [address], subject: mail.subject, html, text, tags: [{ name: 'type', value: tag }] }))),
      });
      if (res.ok) sent += chunk.length;
      else console.error('[mail] resend batch', res.status, await res.text().catch(() => ''));
    } catch (error) {
      console.error('[mail] network', error);
    }
  }
  return sent;
}
