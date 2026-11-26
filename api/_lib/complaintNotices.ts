// Notifications of the Complaints module (README "Powiadomienia", R1–R4). Pure: they plan who gets what (tested in
// complaintNotices.test.ts); api/_lib/complaints.ts passes the result to notify().
// The bell is in English like the hub; the e-mails are in Polish like every Nutri APEX e-mail.
//   R1 new complaint      → administration of the module, the trader, the owner of the purchase contract: bell + e-mail
//   R2 handler assigned   → the new handler: bell + e-mail
//   R3 status changed     → the people of the complaint: bell; e-mail only when it is resolved (and when cancelled: bell)
//   R4 comment or file    → the people of the complaint and administration: bell

import { OUTCOME_LABELS, SETTLEMENT_LABELS, STATUS_LABELS, TYPE_LABELS, participants, type Complaint, type ComplaintStatus } from '../../shared/complaintsApi.js';
import type { Notice, Recipient } from './notifications.js';

export type ComplaintStep = 'created' | 'assigned' | 'status' | 'cancelled' | 'comment' | 'file';

export const STATUS_PL: Record<ComplaintStatus, string> = {
  open: 'Nowa',
  investigating: 'W wyjaśnianiu',
  with_supplier: 'U dostawcy',
  resolved: 'Rozwiązana',
  closed: 'Zamknięta',
  cancelled: 'Anulowana',
};

const TYPE_PL: Record<Complaint['type'], string> = {
  quality: 'jakość / niezgodność ze specyfikacją',
  foreign_matter: 'ciała obce',
  packaging: 'uszkodzone opakowanie',
  quantity: 'ilość / waga',
  documents: 'dokumenty (COA, certyfikaty)',
  late_delivery: 'opóźniona dostawa',
  other: 'inne',
};

const OUTCOME_PL: Record<NonNullable<Complaint['outcome']>, string> = {
  accepted: 'uznana',
  partly_accepted: 'uznana częściowo',
  rejected: 'odrzucona',
  withdrawn: 'wycofana przez klienta',
};

const SETTLEMENT_PL: Record<NonNullable<Complaint['settlement']>, string> = {
  credit_note: 'nota uznaniowa / korekta',
  replacement: 'wymiana towaru',
  discount: 'rabat',
  return: 'zwrot towaru',
  none: 'bez rozliczenia',
};

export interface Planned {
  notice: Omit<Notice, 'to' | 'actorId'>;
  /** E-mail addresses (lower case) of the people who get it. */
  to: string[];
}

function details(c: Complaint): [string, string][] {
  const rows: [string, string][] = [
    ['Reklamacja', c.id],
    ['Klient', c.clientName || '–'],
    ['Kontrakt sprzedaży', c.salesContractId],
  ];
  if (c.purchaseContractId) rows.push(['Kontrakt zakupu', `${c.purchaseContractId}${c.supplierName ? ` (${c.supplierName})` : ''}`]);
  if (c.productName) rows.push(['Produkt', c.productName]);
  rows.push(['Rodzaj', TYPE_PL[c.type]], ['Prowadzi', c.handler.name]);
  return rows;
}

const subject = (c: Complaint) => `${c.id}${c.clientName ? ` · ${c.clientName}` : ''}`;

/**
 * Who gets what after a step. `admins` are the e-mails of the module's administration (complaints-admin, or the hub's
 * administrators when nobody holds it). The actor is dropped later by notify().
 */
export function planComplaintNotice(c: Complaint, step: ComplaintStep, actor: { email: string; name: string }, admins: string[], extra?: { comment?: string | null; fileName?: string }): Planned | null {
  const people = participants(c);
  const lower = (list: string[]) => [...new Set(list.map((e) => e.toLowerCase()).filter(Boolean))];
  const link = `/complaints/${encodeURIComponent(c.id)}`;
  switch (step) {
    case 'created':
      return {
        to: lower([...admins, ...people]),
        notice: {
          module: 'complaints',
          kind: 'complaints.created',
          title: `New complaint ${subject(c)}`,
          body: `${actor.name} registered a complaint: ${TYPE_LABELS[c.type].toLowerCase()}, contract ${c.salesContractId}.`,
          link,
          email: {
            module: 'Reklamacje',
            title: `Nowa reklamacja: ${c.clientName || c.salesContractId}`,
            lead: `${actor.name} zgłosił(a) reklamację do kontraktu ${c.salesContractId}.`,
            todo: 'Administracja: przejrzyj reklamację i w razie potrzeby wyznacz osobę prowadzącą. Handlowiec: dodaj, co wiesz od klienta (komentarz, zdjęcia, korespondencja).',
            comment: c.description.length > 600 ? `${c.description.slice(0, 600)}…` : c.description,
            details: details(c),
            button: 'Otwórz reklamację',
          },
        },
      };
    case 'assigned':
      return {
        to: lower([c.handler.email]),
        notice: {
          module: 'complaints',
          kind: 'complaints.assigned',
          title: `You handle complaint ${subject(c)}`,
          body: `${actor.name} made you the handler.`,
          link,
          email: {
            module: 'Reklamacje',
            title: `Prowadzisz reklamację ${c.id}`,
            lead: `${actor.name} wyznaczył(a) Cię do prowadzenia reklamacji ${c.id}${c.clientName ? ` (${c.clientName})` : ''}.`,
            todo: 'Sprawdź opis i załączniki, zgłoś sprawę dostawcy, jeśli trzeba, i aktualizuj status w module Complaints.',
            details: details(c),
            button: 'Otwórz reklamację',
          },
        },
      };
    case 'status':
    case 'cancelled': {
      const resolved = c.status === 'resolved';
      return {
        to: lower(people),
        notice: {
          module: 'complaints',
          kind: `complaints.${c.status}`,
          title: `Complaint ${subject(c)}: ${STATUS_LABELS[c.status]}`,
          body: resolved && c.outcome && c.settlement
            ? `${OUTCOME_LABELS[c.outcome]} · ${SETTLEMENT_LABELS[c.settlement]}`
            : extra?.comment || `${actor.name} changed the status.`,
          link,
          email: resolved
            ? {
                module: 'Reklamacje',
                title: `Reklamacja ${c.id} rozwiązana`,
                lead: `${actor.name} oznaczył(a) reklamację ${c.id} jako rozwiązaną: ${c.outcome ? OUTCOME_PL[c.outcome] : ''}${c.settlement ? `, ${SETTLEMENT_PL[c.settlement]}` : ''}.`,
                comment: c.resolutionNotes || extra?.comment || null,
                details: [...details(c), ['Status', STATUS_PL[c.status]]],
                button: 'Otwórz reklamację',
              }
            : null,
        },
      };
    }
    case 'comment':
    case 'file':
      return {
        to: lower([...people, ...admins]),
        notice: {
          module: 'complaints',
          kind: `complaints.${step}`,
          title: step === 'comment' ? `${actor.name} commented on ${subject(c)}` : `${actor.name} added a file to ${subject(c)}`,
          body: step === 'comment' ? (extra?.comment ?? '').slice(0, 300) : extra?.fileName ?? null,
          link,
          email: null,
        },
      };
    default:
      return null;
  }
}

/** The planned notice for the people of the hub (by e-mail); people without access to the module are left out. */
export function toNotice(planned: Planned, people: (Recipient & { canSee: boolean })[], actorId: string): Notice {
  const byEmail = new Map(people.filter((p) => p.canSee).map((p) => [p.email.toLowerCase(), p]));
  return {
    ...planned.notice,
    to: planned.to.map((e) => byEmail.get(e)).filter((p): p is Recipient & { canSee: boolean } => Boolean(p)).map(({ id, email, name }) => ({ id, email, name })),
    actorId,
  };
}
