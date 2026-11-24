import { describe, expect, it } from 'vitest';
import { archiveDate, archiveLineTotal, archiveViewerName, filled } from './contractsArchive';

describe('contracts archive (intranet)', () => {
  it('reads both kinds of intranet dates', () => {
    expect(archiveDate('2026-11-24T23:00:00Z')).toBe('2026-11-24');
    expect(archiveDate({ seconds: Date.UTC(2025, 5, 6, 10) / 1000 })).toBe('2025-06-06');
    expect(archiveDate(null)).toBeNull();
    expect(archiveDate('soon')).toBeNull();
  });

  it('converts units like the module', () => {
    expect(archiveLineTotal({ quantity: '1', unit: 'MT', unitPrice: 4.7, priceUnit: 'KG' })).toBe(4700);
    expect(archiveLineTotal({ quantity: '500', unit: 'KG', unitPrice: '1200', priceUnit: 'MT' })).toBe(600);
    expect(archiveLineTotal({ quantity: '2,5', unit: 'KG', unitPrice: '3', priceUnit: 'KG' })).toBe(7.5);
    expect(archiveLineTotal({ quantity: '-', unitPrice: 3 })).toBeNull();
  });

  it('treats "-" as empty', () => {
    expect(filled('-')).toBe('');
    expect(filled(' Berlin ')).toBe('Berlin');
  });

  it('shows a trader only their own old contracts', () => {
    expect(archiveViewerName({ name: 'Tom Trader', isContractAdmin: false, canSign: false })).toBe('Tom Trader');
    expect(archiveViewerName({ name: 'Ada Admin', isContractAdmin: true, canSign: false })).toBeNull();
    expect(archiveViewerName({ name: 'Sam Signer', isContractAdmin: false, canSign: true })).toBeNull();
  });
});
