// The look of the e-mails Nutri APEX sends to the team: the same as the n8n e-mails (navy header, cards,
// "Nutri APEX · Twój asystent AI"), in Polish. Every module of the hub writes its notices with renderApexMail
// (api/_lib/notifications.ts sends them, one e-mail per person). The Contract generator was first to use this look
// (api/_lib/contractMails.ts); the shape here is the same, without anything specific to contracts.

export interface ApexMail {
  /** After "Nutri APEX · ", e.g. "Urlopy". */
  module: string;
  /** Big title in the header; also the subject after "Nutri APEX – <module>: ". */
  title: string;
  /** Recipient's full name (the e-mail starts "Cześć <first name>,"). */
  name: string;
  /** One or two sentences after the greeting: what happened. */
  lead: string;
  /** What the person should do now: the red "Twoja kolej" card. */
  todo?: string | null;
  /** Someone's comment (decision note, reason): the amber card. */
  comment?: string | null;
  /** Label–value lines in the navy card. */
  details?: [string, string][];
  /** The stages of a flow, for the "Etapy" card. */
  steps?: { label: string; state: 'done' | 'now' | 'next' }[] | null;
  button: { label: string; url: string };
  /** Why the person gets it, in the footer. */
  footer?: string;
}

const C = { navy: '#0f2a44', navySoft: '#9fb3c8', text: '#1f2933', muted: '#6b7280', line: '#e5e7eb', bg: '#f3f5f7', white: '#ffffff', red: '#b91c1c', amber: '#b45309', green: '#15803d' };
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const DEFAULT_FOOTER = 'Wiadomość wysłana automatycznie z centrum aplikacji Nutri Partners. Nie odpowiadaj na nią: wszystko załatwisz w aplikacji.';

export function renderApexMail(m: ApexMail): { subject: string; html: string; text: string } {
  const subject = `Nutri APEX – ${m.module}: ${m.title}`;
  const hello = `Cześć ${firstName(m.name)},`;
  const footer = m.footer ?? DEFAULT_FOOTER;
  const details = m.details ?? [];

  const P = `margin:0 0 6px;font-size:13px;line-height:1.5;color:${C.text};${FONT}`;
  const card = (body: string, color: string, title = '') =>
    `<tr><td class="apex-card-td" style="padding:0 20px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.white};border:1px solid ${C.line};border-left:4px solid ${color};border-radius:8px;"><tr><td class="apex-card-in" style="padding:14px 18px;">` +
    (title ? `<div style="margin:0 0 6px;font-size:15px;font-weight:700;color:${C.navy};${FONT}">${esc(title)}</div>` : '') +
    `${body}</td></tr></table></td></tr>`;

  let body = '';
  if (m.todo) body += card(`<div style="${P}margin-bottom:0;">${esc(m.todo)}</div>`, C.red, 'Twoja kolej');
  if (m.comment) body += card(`<div style="${P}margin-bottom:0;white-space:pre-line;">${esc(m.comment)}</div>`, C.amber, 'Komentarz');
  if (details.length) {
    body += card(details.map(([k, v]) => `<div style="${P}"><span style="color:${C.muted};">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`).join(''), C.navy);
  }
  if (m.steps?.length) {
    const mark = { done: `<span style="color:${C.green};">&#10003;</span>`, now: `<span style="color:${C.red};">&#9679;</span>`, next: `<span style="color:${C.line};">&#9675;</span>` };
    body += card(
      m.steps
        .map((s) => `<div style="${P}${s.state === 'next' ? `color:${C.muted};` : ''}">${mark[s.state]}&nbsp; ${s.state === 'now' ? `<strong>${esc(s.label)}</strong>` : esc(s.label)}</div>`)
        .join(''),
      C.navySoft,
      'Etapy',
    );
  }
  body +=
    `<tr><td style="padding:4px 20px 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="background:${C.navy};border-radius:8px;padding:11px 20px;"><a href="${esc(m.button.url)}" style="font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;${FONT}">${esc(m.button.label)}</a></td>` +
    `</tr></table></td></tr>`;

  const css =
    `body{margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;} table{border-collapse:collapse;} ` +
    '@media only screen and (max-width:520px){.apex-outer{padding:10px 0 !important;} .apex-head{padding:18px 16px !important;border-radius:0 !important;} ' +
    '.apex-card-td{padding:0 8px 10px !important;} .apex-card-in{padding:12px 12px !important;} .apex-foot{padding:6px 16px 0 !important;} }';
  const html =
    `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${esc(subject)}</title><style>${css}</style></head>` +
    `<body style="margin:0;padding:0;background:${C.bg};${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.bg};">` +
    `<tr><td class="apex-outer" align="center" style="padding:24px 0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:600px;border-collapse:collapse;">` +
    `<tr><td class="apex-head" style="background:${C.navy};padding:20px 24px;border-radius:12px 12px 0 0;"><div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.navySoft};font-weight:700;${FONT}">Nutri APEX · ${esc(m.module)}</div>` +
    `<div style="font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;margin-top:6px;${FONT}">${esc(m.title)}</div></td></tr>` +
    `<tr><td style="background:#ffffff;padding:14px 24px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.text};${FONT}">${esc(hello)} ${esc(m.lead)}</td></tr>` +
    `<tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>${body}` +
    `<tr><td class="apex-foot" style="padding:6px 24px 0;${FONT}"><div style="border-top:1px solid ${C.line};padding-top:14px;font-size:13px;color:${C.text};"><strong>Nutri APEX</strong> · <em style="color:${C.muted};">Twój asystent AI</em></div>` +
    `<div style="font-size:11px;color:${C.muted};margin-top:4px;line-height:1.5;">${esc(footer)}</div></td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    `${hello} ${m.lead}`,
    ...(m.todo ? ['', `Twoja kolej: ${m.todo}`] : []),
    ...(m.comment ? ['', `Komentarz: ${m.comment}`] : []),
    ...(details.length ? ['', ...details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(m.steps?.length ? ['', `Etapy: ${m.steps.map((s) => (s.state === 'done' ? '✓ ' : s.state === 'now' ? '● ' : '○ ') + s.label).join(' → ')}`] : []),
    '',
    `${m.button.label}: ${m.button.url}`,
    '',
    '—',
    'Nutri APEX · Twój asystent AI',
    footer,
  ].join('\n');
  return { subject, html, text };
}
