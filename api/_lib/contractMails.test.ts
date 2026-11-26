import { describe, expect, it } from 'vitest';
import type { Contract } from '../../shared/contractsApi';
import { contractMails, planContractMails, progress, type FlowPeople } from './contractMails';

const contract = (patch: Partial<Contract> = {}): Contract =>
  ({
    id: '14-S-MS-2026',
    type: 'S',
    status: 'admin_review',
    ownerEmail: 'trader@example.com',
    ownerName: 'Tom Trader',
    createdByEmail: 'trader@example.com',
    submissionDate: '2026-11-23',
    companyId: 1,
    companyName: 'Acme Foods',
    currency: 'EUR',
    amountNet: 12345.5,
    fxEurPerUnit: 1,
    amountEur: 12345.5,
    boardRequired: false,
    factoring: false,
    data: {} as Contract['data'],
    version: 1,
    enovaOrder: null,
    acceptedBy: null,
    approvedBy: null,
    signedBy: null,
    clientScan: null,
    returnComment: null,
    createdAt: '2026-11-23T10:00:00Z',
    updatedAt: '2026-11-23T10:00:00Z',
    ...patch,
  }) as Contract;

const people: FlowPeople = {
  administration: ['admin@example.com'],
  firstSigners: ['signer@example.com'],
  board: ['board@example.com'],
  names: { 'trader@example.com': 'Tom Trader', 'admin@example.com': 'Ada Admin', 'signer@example.com': 'Sam Signer', 'board@example.com': 'Bo Board' },
};
const trader = { email: 'trader@example.com', name: 'Tom Trader' };
const admin = { email: 'admin@example.com', name: 'Ada Admin' };
const stamp = (email: string, name: string) => ({ email, name, at: '2026-11-23T11:00:00Z' });

const summary = (plan: ReturnType<typeof planContractMails>) => Object.fromEntries([...plan].map(([to, m]) => [to, m.turn ? 'turn' : 'info']));

describe('contract e-mails: who gets what', () => {
  it('a new contract goes to administration; the trader who made it gets nothing', () => {
    expect(summary(planContractMails(contract(), 'create', trader, people))).toEqual({ 'admin@example.com': 'turn' });
  });

  it('a contract made by an administrator for a trader tells the trader', () => {
    const plan = planContractMails(contract({ createdByEmail: 'admin@example.com' }), 'create', admin, { ...people, administration: ['admin@example.com', 'jadwiga@example.com'] });
    expect(summary(plan)).toEqual({ 'jadwiga@example.com': 'turn', 'trader@example.com': 'info' });
    expect(plan.get('trader@example.com')?.lead).toContain('w Twoim imieniu');
  });

  it('a contract created for a trader (contracts-for-others): the creator hears like the trader and handles returns and the client scan', () => {
    const k = { email: 'klaudia@example.com', name: 'Klaudia K' };
    const made = (patch: Partial<Contract> = {}) => contract({ createdByEmail: k.email, ...patch });
    expect(summary(planContractMails(made(), 'create', k, people))).toEqual({ 'admin@example.com': 'turn', 'trader@example.com': 'info' });
    const accepted = made({ status: 'signature', acceptedBy: stamp('admin@example.com', 'Ada Admin') });
    expect(summary(planContractMails(accepted, 'accept', admin, people))).toMatchObject({ 'signer@example.com': 'turn', 'trader@example.com': 'info', 'klaudia@example.com': 'info' });
    expect(summary(planContractMails(made({ status: 'returned' }), 'return', admin, people))).toMatchObject({ 'trader@example.com': 'turn', 'klaudia@example.com': 'turn' });
    const signed = made({ status: 'signed', signedBy: { ...stamp('signer@example.com', 'Sam Signer'), title: 'CEO' } });
    expect(summary(planContractMails(signed, 'sign', { email: 'signer@example.com', name: 'Sam Signer' }, people))).toMatchObject({ 'trader@example.com': 'turn', 'klaudia@example.com': 'turn' });
  });

  it('acceptance: the signer signs, the trader is told; above the threshold the signer approves', () => {
    const accepted = contract({ status: 'signature', acceptedBy: stamp('admin@example.com', 'Ada Admin') });
    expect(summary(planContractMails(accepted, 'accept', admin, people))).toEqual({ 'signer@example.com': 'turn', 'trader@example.com': 'info' });
    const big = planContractMails({ ...accepted, boardRequired: true }, 'accept', admin, people);
    expect(big.get('signer@example.com')?.title).toContain('zatwierdzenie');
  });

  it('approval above the threshold goes to the board and tells the trader and administration', () => {
    const c = contract({ status: 'board', boardRequired: true, acceptedBy: stamp('admin@example.com', 'Ada Admin'), approvedBy: stamp('signer@example.com', 'Sam Signer') });
    expect(summary(planContractMails(c, 'approve', { email: 'signer@example.com', name: 'Sam Signer' }, people))).toEqual({
      'board@example.com': 'turn',
      'trader@example.com': 'info',
      'admin@example.com': 'info',
    });
  });

  it('signature: the trader sends it to the client, administration and the approver are told', () => {
    const c = contract({ status: 'signed', boardRequired: true, acceptedBy: stamp('admin@example.com', 'Ada Admin'), approvedBy: stamp('signer@example.com', 'Sam Signer') });
    const plan = planContractMails(c, 'sign', { email: 'board@example.com', name: 'Bo Board' }, people);
    expect(summary(plan)).toEqual({ 'trader@example.com': 'turn', 'admin@example.com': 'info', 'signer@example.com': 'info' });
    expect(plan.get('trader@example.com')?.todo).toContain('OWS');
  });

  it('return, cancel and the client scan reach everyone involved, never the author', () => {
    const c = contract({ status: 'returned', acceptedBy: stamp('admin@example.com', 'Ada Admin') });
    expect(summary(planContractMails(c, 'return', { email: 'signer@example.com', name: 'Sam Signer' }, people))).toEqual({ 'trader@example.com': 'turn', 'admin@example.com': 'info' });
    expect(summary(planContractMails({ ...c, status: 'cancelled' }, 'cancel', admin, people))).toEqual({ 'trader@example.com': 'info', 'signer@example.com': 'info' });
    const scanned = contract({ status: 'client_signed', acceptedBy: stamp('admin@example.com', 'Ada Admin'), signedBy: { ...stamp('signer@example.com', 'Sam Signer'), title: 'CEO' } });
    expect(summary(planContractMails(scanned, 'client_scan', trader, people))).toEqual({ 'admin@example.com': 'turn', 'signer@example.com': 'info' });
  });
});

describe('contract e-mails: everyone who accepts hears about each step (24.11.2026)', () => {
  const signer = { email: 'signer@example.com', name: 'Sam Signer' };
  const board = { email: 'board@example.com', name: 'Bo Board' };
  const otherBoard: FlowPeople = { ...people, board: ['board@example.com', 'board2@example.com'] };

  it('up to the threshold: administration and the signer, after each other\'s step', () => {
    const accepted = contract({ status: 'signature', enovaOrder: 'ZO/1', acceptedBy: stamp('admin@example.com', 'Ada Admin') });
    expect(summary(planContractMails(accepted, 'accept', admin, otherBoard))).toEqual({ 'signer@example.com': 'turn', 'trader@example.com': 'info' });
    const signed = { ...accepted, status: 'signed' as const };
    expect(summary(planContractMails(signed, 'sign', signer, otherBoard))).toEqual({ 'trader@example.com': 'turn', 'admin@example.com': 'info' });
  });

  it('above the threshold: administration, the signer and the whole board, after each step', () => {
    const accepted = contract({ status: 'signature', boardRequired: true, enovaOrder: 'ZO/2', acceptedBy: stamp('admin@example.com', 'Ada Admin') });
    expect(summary(planContractMails(accepted, 'accept', admin, otherBoard))).toEqual({
      'signer@example.com': 'turn', 'trader@example.com': 'info', 'board@example.com': 'info', 'board2@example.com': 'info',
    });
    const approved = { ...accepted, status: 'board' as const, approvedBy: stamp('signer@example.com', 'Sam Signer') };
    expect(summary(planContractMails(approved, 'approve', signer, otherBoard))).toEqual({
      'board@example.com': 'turn', 'board2@example.com': 'turn', 'trader@example.com': 'info', 'admin@example.com': 'info',
    });
    const signed = { ...approved, status: 'signed' as const };
    expect(summary(planContractMails(signed, 'sign', board, otherBoard))).toEqual({
      'trader@example.com': 'turn', 'admin@example.com': 'info', 'signer@example.com': 'info', 'board2@example.com': 'info',
    });
  });
});

describe('contract e-mails: content', () => {
  it('shows the stage the contract is at', () => {
    expect(progress(contract({ status: 'signature' }))?.map((s) => s.state)).toEqual(['done', 'done', 'now', 'next']);
    expect(progress(contract({ status: 'signature', boardRequired: true }))?.map((s) => s.label)).toContain('Zatwierdzenie');
    expect(progress(contract({ status: 'returned' }))).toBeNull();
  });

  it('greets the person, says what to do and escapes the content', () => {
    const [mail] = contractMails(contract({ companyName: 'Acme <Foods>' }), 'create', trader, people, 'https://hub.example/contracts/14-S-MS-2026', 'Check <price>');
    expect(mail.to).toBe('admin@example.com');
    expect(mail.subject).toBe('Nutri APEX – Kontrakty: Kontrakt 14-S-MS-2026 czeka na Twoją akceptację');
    expect(mail.text).toContain('Cześć Ada,');
    expect(mail.text).toContain('Wartość netto: 12 345,50 EUR');
    expect(mail.html).toContain('Acme &lt;Foods&gt;');
    expect(mail.html).toContain('Check &lt;price&gt;');
    expect(mail.html).toContain('Twoja kolej');
    expect(mail.html).toContain('Nutri APEX · Kontrakty');
  });
});
