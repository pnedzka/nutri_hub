// E-mails of the Contract generator: after every step of the approval flow each person involved gets a message. The
// person whose turn it is gets "your turn" (with what to do); the others get a short status update. The look follows
// the e-mails Nutri APEX sends from n8n (navy header, cards, "Nutri APEX · Twój asystent AI"), in Polish like them.
// Pure functions: recipients and content are planned here and tested; contracts.ts only sends them.

import { BOARD_THRESHOLD_EUR, type Contract, type ContractAction } from '../../shared/contractsApi.js';

export type ContractStep = Exclude<ContractAction, 'edit'> | 'create' | 'update';

/** The people of the flow, already resolved by the server (e-mails in lower case). */
export interface FlowPeople {
  /** Administration: people with contracts-admin (Jadwiga), or the admins when nobody has it. */
  administration: string[];
  /** Signers below the threshold (Marcin Niećko). */
  firstSigners: string[];
  /** Board members who sign above the threshold. */
  board: string[];
  /** Display names by e-mail. */
  names: Record<string, string>;
}

export interface PlannedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const C = { navy: '#0f2a44', navySoft: '#9fb3c8', text: '#1f2933', muted: '#6b7280', line: '#e5e7eb', bg: '#f3f5f7', white: '#ffffff', red: '#b91c1c', amber: '#b45309', green: '#15803d' };
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const amount = (n: number, currency: string) =>
  `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, ' ')} ${currency}`;
const threshold = `${BOARD_THRESHOLD_EUR.toLocaleString('pl-PL').replace(/[\u00a0\u202f]/g, ' ')} EUR`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

interface Message {
  /** "Twoja kolej" or a status update. */
  turn: boolean;
  title: string;
  lead: string;
  /** What the person should do (your turn only). */
  todo?: string;
}

/** What each person gets after a step: e-mail → message. The author of the step gets nothing. */
export function planContractMails(contract: Contract, step: ContractStep, actor: { email: string; name: string }, people: FlowPeople): Map<string, Message> {
  const id = contract.id;
  const owner = contract.ownerEmail.toLowerCase();
  const who = actor.name;
  const sale = contract.type === 'S';
  const kind = sale ? 'sprzedaży' : 'zakupu';
  const terms = sale ? 'OWS' : 'OWZ';
  const stamps = [contract.acceptedBy?.email, contract.approvedBy?.email].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase());
  const signers = people.firstSigners.length ? people.firstSigners : people.board;
  const plan = new Map<string, Message>();
  const turn = (emails: string[], m: Omit<Message, 'turn'>) => emails.forEach((e) => plan.set(e.toLowerCase(), { ...m, turn: true }));
  // A status update never replaces "your turn".
  const info = (emails: string[], m: Omit<Message, 'turn' | 'todo'>) =>
    emails.forEach((e) => {
      if (!plan.has(e.toLowerCase())) plan.set(e.toLowerCase(), { ...m, turn: false });
    });

  switch (step) {
    case 'create':
    case 'update': {
      const verb = step === 'create' ? 'wygenerował(a)' : 'poprawił(a) i wysłał(a) ponownie';
      turn(people.administration, {
        title: `Kontrakt ${id} czeka na Twoją akceptację`,
        lead: `${who} ${verb} kontrakt ${kind} ${id} dla ${contract.companyName}.`,
        todo: 'Wprowadź zamówienie w enova, a potem zaakceptuj kontrakt w module (wpisz wewnętrzny numer zamówienia z enova). Jeśli coś się nie zgadza, zwróć go do poprawki z komentarzem.',
      });
      const next = 'Teraz administracja wprowadza zamówienie w enova i akceptuje kontrakt.';
      info([owner], { title: `Kontrakt ${id} jest u administracji`, lead: `${who} ${verb} kontrakt ${id} w Twoim imieniu. ${next}` });
      info([contract.createdByEmail], { title: `Kontrakt ${id} jest u administracji`, lead: `${who} ${verb} kontrakt ${id}. ${next}` });
      break;
    }
    case 'accept':
      turn(signers, {
        title: contract.boardRequired ? `Kontrakt ${id} czeka na Twoje zatwierdzenie` : `Kontrakt ${id} czeka na Twój podpis`,
        lead: `${who} zaakceptował(a) kontrakt ${id} dla ${contract.companyName}${contract.enovaOrder ? ` (numer zamówienia enova ${contract.enovaOrder})` : ''}.`,
        todo: contract.boardRequired
          ? `Kontrakt przekracza ${threshold} netto: zatwierdź go, a podpisze członek zarządu. Możesz też zwrócić go do poprawki.`
          : 'Sprawdź kontrakt i podpisz go w module. Możesz też zwrócić go do poprawki.',
      });
      info([owner], {
        title: `Administracja zaakceptowała kontrakt ${id}`,
        lead: `${who} zaakceptował(a) Twój kontrakt ${id} dla ${contract.companyName}. Teraz czeka na ${contract.boardRequired ? 'zatwierdzenie i podpis zarządu' : 'podpis'}.`,
      });
      break;
    case 'approve':
      turn(people.board, {
        title: `Kontrakt ${id} czeka na podpis zarządu`,
        lead: `${who} zatwierdził(a) kontrakt ${id} dla ${contract.companyName}. Kontrakt przekracza ${threshold} netto.`,
        todo: 'Podpisz kontrakt w module jako członek zarządu albo zwróć go do poprawki.',
      });
      info([owner, ...stamps], {
        title: `Kontrakt ${id} czeka na podpis zarządu`,
        lead: `${who} zatwierdził(a) kontrakt ${id}. Teraz podpisuje go członek zarządu.`,
      });
      break;
    case 'sign':
      turn([owner], {
        title: `Kontrakt ${id} jest podpisany: wyślij go klientowi`,
        lead: `${who} podpisał(a) Twój kontrakt ${id} dla ${contract.companyName}.`,
        todo: `Pobierz w module oba PDF-y (kontrakt i ${terms}), wyślij je klientowi, a skan podpisany przez klienta wgraj do kontraktu.`,
      });
      info([...people.administration, ...stamps], {
        title: `Kontrakt ${id} jest podpisany`,
        lead: `${who} podpisał(a) kontrakt ${id} dla ${contract.companyName}. Handlowiec wyśle go klientowi i wgra skan podpisany przez klienta.`,
      });
      break;
    case 'return':
      turn([owner], {
        title: `Kontrakt ${id} wrócił do poprawki`,
        lead: `${who} zwrócił(a) Twój kontrakt ${id} dla ${contract.companyName}.`,
        todo: 'Popraw kontrakt według komentarza i wyślij go ponownie. Wróci do administracji.',
      });
      info([...people.administration, ...stamps], {
        title: `Kontrakt ${id} wrócił do poprawki`,
        lead: `${who} zwrócił(a) kontrakt ${id} handlowcowi. Po poprawce wróci do administracji.`,
      });
      break;
    case 'cancel':
      info([owner, contract.createdByEmail, ...people.administration, ...stamps], {
        title: `Kontrakt ${id} został anulowany`,
        lead: `${who} anulował(a) kontrakt ${id} dla ${contract.companyName}. Nie trzeba nic robić.`,
      });
      break;
    case 'client_scan':
      turn(people.administration, {
        title: `Klient podpisał kontrakt ${id}`,
        lead: `${who} wgrał(a) skan kontraktu ${id} podpisanego przez ${contract.companyName}.`,
        todo: 'Skan jest w module. Na jego podstawie można wystawić fakturę w enova.',
      });
      info([owner, ...stamps, contract.signedBy?.email ?? ''], {
        title: `Klient podpisał kontrakt ${id}`,
        lead: `${contract.companyName} podpisał(a) kontrakt ${id}. Obieg w module jest zakończony.`,
      });
      break;
  }
  plan.delete('');
  plan.delete(actor.email.toLowerCase());
  return plan;
}

/** The steps of the flow with their state, for the tracker in the e-mail. */
export function progress(contract: Contract): { label: string; state: 'done' | 'now' | 'next' }[] | null {
  if (contract.status === 'returned' || contract.status === 'cancelled') return null;
  const steps = [
    { key: 'created', label: 'Wygenerowany' },
    { key: 'accept', label: 'Akceptacja administracji' },
    ...(contract.boardRequired ? [{ key: 'approve', label: 'Zatwierdzenie' }] : []),
    { key: 'sign', label: contract.boardRequired ? 'Podpis zarządu' : 'Podpis Nutri Partners' },
    { key: 'client', label: 'Podpis klienta' },
  ];
  const current: Record<Contract['status'], string> = {
    admin_review: 'accept',
    signature: contract.boardRequired ? 'approve' : 'sign',
    board: 'sign',
    signed: 'client',
    client_signed: '',
    returned: '',
    cancelled: '',
  };
  const now = steps.findIndex((s) => s.key === current[contract.status]);
  return steps.map((s, i) => ({ label: s.label, state: now === -1 || i < now ? 'done' : i === now ? 'now' : 'next' }));
}

export function renderContractMail(contract: Contract, m: Message, name: string, url: string, comment?: string | null): Omit<PlannedMail, 'to'> {
  const subject = `Nutri APEX – Kontrakty: ${m.title}`;
  const details: [string, string][] = [
    ['Kontrakt', `${contract.id} · ${contract.type === 'S' ? 'sprzedaż' : 'zakup'}`],
    [contract.type === 'S' ? 'Kupujący' : 'Dostawca', contract.companyName],
    ['Wartość netto', amount(contract.amountNet, contract.currency)],
    ['Handlowiec', contract.ownerName],
  ];
  if (contract.enovaOrder) details.push(['Numer zamówienia enova', contract.enovaOrder]);
  const hello = `Cześć ${firstName(name)},`;

  const P = `margin:0 0 6px;font-size:13px;line-height:1.5;color:${C.text};${FONT}`;
  const card = (body: string, color: string, title = '') =>
    `<tr><td class="apex-card-td" style="padding:0 20px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.white};border:1px solid ${C.line};border-left:4px solid ${color};border-radius:8px;"><tr><td class="apex-card-in" style="padding:14px 18px;">` +
    (title ? `<div style="margin:0 0 6px;font-size:15px;font-weight:700;color:${C.navy};${FONT}">${title}</div>` : '') +
    `${body}</td></tr></table></td></tr>`;

  let body = '';
  if (m.todo) body += card(`<div style="${P}margin-bottom:0;">${esc(m.todo)}</div>`, C.red, 'Twoja kolej');
  if (comment) body += card(`<div style="${P}margin-bottom:0;white-space:pre-line;">${esc(comment)}</div>`, C.amber, 'Komentarz');
  body += card(
    details.map(([k, v]) => `<div style="${P}"><span style="color:${C.muted};">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`).join(''),
    C.navy,
  );
  const steps = progress(contract);
  if (steps) {
    const mark = { done: `<span style="color:${C.green};">&#10003;</span>`, now: `<span style="color:${C.red};">&#9679;</span>`, next: `<span style="color:${C.line};">&#9675;</span>` };
    body += card(
      steps
        .map((s) => `<div style="${P}${s.state === 'next' ? `color:${C.muted};` : ''}">${mark[s.state]}&nbsp; ${s.state === 'now' ? `<strong>${esc(s.label)}</strong>` : esc(s.label)}</div>`)
        .join(''),
      C.navySoft,
      'Etapy',
    );
  }
  body +=
    `<tr><td style="padding:4px 20px 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="background:${C.navy};border-radius:8px;padding:11px 20px;"><a href="${esc(url)}" style="font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;${FONT}">Otwórz kontrakt</a></td>` +
    `</tr></table></td></tr>`;

  const css =
    `body{margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;} table{border-collapse:collapse;} ` +
    '@media only screen and (max-width:520px){.apex-outer{padding:10px 0 !important;} .apex-head{padding:18px 16px !important;border-radius:0 !important;} ' +
    '.apex-card-td{padding:0 8px 10px !important;} .apex-card-in{padding:12px 12px !important;} .apex-foot{padding:6px 16px 0 !important;} }';
  const foot = 'Wiadomość wysłana automatycznie z Generatora kontraktów w centrum aplikacji Nutri Partners. Nie odpowiadaj na nią: wszystko załatwisz w module.';
  const html =
    `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${esc(subject)}</title><style>${css}</style></head>` +
    `<body style="margin:0;padding:0;background:${C.bg};${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.bg};">` +
    `<tr><td class="apex-outer" align="center" style="padding:24px 0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:600px;border-collapse:collapse;">` +
    `<tr><td class="apex-head" style="background:${C.navy};padding:20px 24px;border-radius:12px 12px 0 0;"><div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.navySoft};font-weight:700;${FONT}">Nutri APEX · Kontrakty</div>` +
    `<div style="font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;margin-top:6px;${FONT}">${esc(m.title)}</div></td></tr>` +
    `<tr><td style="background:#ffffff;padding:14px 24px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.text};${FONT}">${esc(hello)} ${esc(m.lead)}</td></tr>` +
    `<tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>${body}` +
    `<tr><td class="apex-foot" style="padding:6px 24px 0;${FONT}"><div style="border-top:1px solid ${C.line};padding-top:14px;font-size:13px;color:${C.text};"><strong>Nutri APEX</strong> · <em style="color:${C.muted};">Twój asystent AI</em></div>` +
    `<div style="font-size:11px;color:${C.muted};margin-top:4px;line-height:1.5;">${esc(foot)}</div></td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    `${hello} ${m.lead}`,
    ...(m.todo ? ['', `Twoja kolej: ${m.todo}`] : []),
    ...(comment ? ['', `Komentarz: ${comment}`] : []),
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    ...(steps ? ['', `Etapy: ${steps.map((s) => (s.state === 'done' ? '✓ ' : s.state === 'now' ? '● ' : '○ ') + s.label).join(' → ')}`] : []),
    '',
    `Otwórz kontrakt: ${url}`,
    '',
    '—',
    'Nutri APEX · Twój asystent AI',
    foot,
  ].join('\n');
  return { subject, html, text };
}

/** All e-mails of one step, one per person. */
export function contractMails(contract: Contract, step: ContractStep, actor: { email: string; name: string }, people: FlowPeople, url: string, comment?: string | null): PlannedMail[] {
  return [...planContractMails(contract, step, actor, people)].map(([to, m]) => ({
    to,
    ...renderContractMail(contract, m, people.names[to] ?? to.split('@')[0], url, comment),
  }));
}
