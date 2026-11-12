import { describe, expect, it } from 'vitest';
import { buildIngestWorkflow, connectInput, firstReference, historyEmail, historyInput, htmlToText, imapSince, isCompanyMailbox, isQuiet, listAttachments, pickBodyPart, pickSentFolder, readFrom, workflowName } from './mailboxApi';

describe('connectInput', () => {
  it('needs consent and a password', () => {
    expect(() => connectInput({ password: 'x' })).toThrow(/agree/);
    expect(() => connectInput({ consent: true })).toThrow(/password/);
    expect(() => connectInput({ consent: true, password: 'x'.repeat(257) })).toThrow(/too long/);
    expect(connectInput({ consent: true, password: ' secret ' })).toEqual({ password: ' secret ' });
  });
});

describe('isCompanyMailbox', () => {
  it('accepts only the company domains', () => {
    expect(isCompanyMailbox('j.kowalski@nutripartners.co', ['nutripartners.co'])).toBe(true);
    expect(isCompanyMailbox('J.Kowalski@NutriPartners.co', ['nutripartners.co'])).toBe(true);
    expect(isCompanyMailbox('someone@gmail.com', ['nutripartners.co'])).toBe(false);
    expect(isCompanyMailbox('x@nutripartners.co.evil.com', ['nutripartners.co'])).toBe(false);
    expect(isCompanyMailbox('@nutripartners.co', ['nutripartners.co'])).toBe(false);
  });
});

describe('pickSentFolder', () => {
  it('prefers the folder marked \\Sent, then a usual name, then Sent', () => {
    expect(pickSentFolder([{ path: 'INBOX' }, { path: 'Sent' }, { path: 'Wysłane', specialUse: '\\Sent' }])).toBe('Wysłane');
    expect(pickSentFolder([{ path: 'INBOX' }, { path: 'INBOX.Sent' }])).toBe('INBOX.Sent');
    expect(pickSentFolder([{ path: 'INBOX' }, { path: 'Sent Items' }])).toBe('Sent Items');
    expect(pickSentFolder([{ path: 'INBOX' }])).toBe('Sent');
  });
});

describe('dates', () => {
  const now = new Date('2026-11-11T17:00:00Z');
  it('formats the IMAP SINCE date like the existing workflow', () => {
    expect(imapSince(new Date('2026-09-27T10:00:00Z'))).toBe('September 27, 2026');
  });
  it('reads history on the first connection and continues after the last e-mail later', () => {
    expect(readFrom(null, 30, now).toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(readFrom('2026-11-10T08:00:00Z', 30, now).toISOString()).toBe('2026-11-09T08:00:00.000Z');
    expect(readFrom('2026-12-01T00:00:00Z', 30, now).getTime()).toBe(now.getTime());
  });
  it('calls a connected mailbox quiet after some days without e-mails', () => {
    expect(isQuiet({ status: 'connected', lastInAt: '2026-11-10T00:00:00Z', connectedAt: null }, now)).toBe(false);
    expect(isQuiet({ status: 'connected', lastInAt: '2026-11-01T00:00:00Z', connectedAt: null }, now)).toBe(true);
    expect(isQuiet({ status: 'disconnected', lastInAt: '2026-11-01T00:00:00Z', connectedAt: null }, now)).toBe(false);
  });
});

describe('buildIngestWorkflow', () => {
  const workflow = buildIngestWorkflow({
    mailbox: 'a.nowak@nutripartners.co',
    imapCredential: { id: 'c1', name: 'a.nowak@nutripartners.co (centrum)' },
    dbCredential: { id: 'db', name: 'Supabase nutri-central-db' },
    sentFolder: 'INBOX.Sent',
    since: { in: new Date('2026-10-12T00:00:00Z'), out: new Date('2026-10-01T00:00:00Z') },
    errorWorkflowId: 'err',
  });
  const nodes = workflow.nodes as unknown as { name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { id: string }> }[];
  const imap = nodes.filter((n) => n.type === 'n8n-nodes-base.emailReadImap');

  it('reads Inbox and Sent without marking mail as read', () => {
    expect(workflow.name).toBe(workflowName('a.nowak@nutripartners.co'));
    expect(new Set(workflow.nodes.map((n) => n.id)).size).toBe(workflow.nodes.length);
    expect(imap.map((n) => n.parameters.mailbox)).toEqual(['INBOX', 'INBOX.Sent']);
    expect(imap.every((n) => n.parameters.postProcessAction === 'nothing' && n.credentials?.imap.id === 'c1')).toBe(true);
    expect((imap[0].parameters.options as { customEmailConfig: string }).customEmailConfig).toBe('["ALL",["SINCE","October 12, 2026"]]');
    expect((imap[1].parameters.options as { customEmailConfig: string }).customEmailConfig).toBe('["ALL",["SINCE","October 1, 2026"]]');
    expect(workflow.settings).toMatchObject({ errorWorkflow: 'err', executionOrder: 'v1' });
  });

  it('marks mailbox and direction and saves to raw.emails', () => {
    const marks = nodes.filter((n) => n.type === 'n8n-nodes-base.set');
    const values = marks.map((n) => (n.parameters.assignments as { assignments: { name: string; value: string }[] }).assignments);
    expect(values.map((a) => a.find((x) => x.name === 'np_direction')?.value)).toEqual(['in', 'out']);
    expect(values.every((a) => a.find((x) => x.name === 'np_mailbox')?.value === 'a.nowak@nutripartners.co')).toBe(true);
    const save = nodes.find((n) => n.type === 'n8n-nodes-base.postgres')!;
    expect(String(save.parameters.query)).toContain('on conflict (mailbox, message_id) do nothing');
    expect(String((save.parameters.options as { queryReplacement: string }).queryReplacement)).toContain(String.raw`/<style[\s\S]*?<\/style>/gi`);
    for (const n of [...imap, ...marks]) expect(workflow.connections[n.name]).toBeDefined();
  });
});

describe('history read by the hub', () => {
  const structure = {
    type: 'multipart/mixed',
    childNodes: [
      { type: 'multipart/alternative', part: '1', childNodes: [{ type: 'text/plain', part: '1.1', size: 10 }, { type: 'text/html', part: '1.2', size: 20 }] },
      { type: 'application/pdf', part: '2', size: 152_000, disposition: 'attachment', dispositionParameters: { filename: 'offer.pdf' } },
    ],
  };

  it('checks the history request', () => {
    expect(historyInput({ password: 'x' })).toEqual({ password: 'x', cursor: null });
    expect(historyInput({ password: 'x', cursor: { folder: 'out', uid: 12 } })).toEqual({ password: 'x', cursor: { folder: 'out', uid: 12 } });
    expect(() => historyInput({ cursor: null })).toThrow(/password/);
    expect(() => historyInput({ password: 'x', cursor: { folder: 'spam', uid: 1 } })).toThrow(/cursor/);
    expect(() => historyInput({ password: 'x', cursor: { folder: 'in', uid: -1 } })).toThrow(/cursor/);
  });

  it('reads the plain text, otherwise HTML, and lists attachments without the files', () => {
    expect(pickBodyPart(structure)).toEqual({ part: '1.1', html: false });
    expect(pickBodyPart({ type: 'multipart/alternative', childNodes: [{ type: 'text/html', part: '1' }] })).toEqual({ part: '1', html: true });
    expect(pickBodyPart({ type: 'text/plain' })).toEqual({ part: '1', html: false });
    expect(pickBodyPart({ type: 'multipart/mixed', childNodes: [{ type: 'image/png', part: '1' }] })).toBeNull();
    expect(listAttachments(structure)).toEqual([{ name: 'offer.pdf', type: 'application/pdf', size: '114 kB' }]);
    expect(htmlToText('<style>p{}</style><p>Hello <b>you</b></p>')).toBe(' Hello you ');
    expect(firstReference('<a@x> <b@x>')).toBe('<a@x>');
    expect(firstReference(undefined)).toBeNull();
  });

  it('builds the same fields as the n8n workflow', () => {
    const email = historyEmail(
      'j.kowalski@nutripartners.co',
      'out',
      {
        envelope: {
          messageId: '<m1@x>',
          inReplyTo: '<m0@x>',
          subject: 'Offer',
          date: new Date('2026-10-20T08:00:00Z'),
          from: [{ address: 'J.Kowalski@nutripartners.co' }],
          to: [{ address: 'buyer@example.com' }],
          cc: [],
        },
        references: '<root@x> <m0@x>',
        bodyStructure: structure,
      },
      { text: '<p>Hi</p>', html: true },
    );
    expect(email).toEqual({
      direction: 'out',
      messageId: '<m1@x>',
      inReplyTo: '<m0@x>',
      thread: '<root@x>',
      from: 'J.Kowalski@nutripartners.co',
      to: ['buyer@example.com'],
      cc: [],
      subject: 'Offer',
      body: ' Hi ',
      attachments: [{ name: 'offer.pdf', type: 'application/pdf', size: '114 kB' }],
      date: '2026-10-20T08:00:00.000Z',
    });
    const bare = historyEmail('a@nutripartners.co', 'in', { internalDate: '2026-10-01T00:00:00Z' }, null);
    expect(bare.messageId).toBe('a@nutripartners.co:2026-10-01T00:00:00.000Z:');
    expect(bare.thread).toBe(bare.messageId);
  });
});
