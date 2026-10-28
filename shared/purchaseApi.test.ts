import { describe, expect, it } from 'vitest';
import { PurchaseInputError, proposalStatus, purchaseAction, reviewFilters, reviewQuery } from './purchaseApi';

describe('reviewFilters', () => {
  it('reads known filters and ignores the rest', () => {
    expect(reviewFilters(new URLSearchParams('type=product_mapping&category=Dairy%20Ingredients&maxConfidence=0.8&withOffers=1&q=%20whey%20&page=3'))).toEqual({
      type: 'product_mapping',
      category: 'Dairy Ingredients',
      maxConfidence: 0.8,
      withOffers: true,
      q: 'whey',
      page: 3,
    });
    expect(reviewFilters(new URLSearchParams('type=company_merge&maxConfidence=7&page=-1&q=%20'))).toEqual({
      type: null,
      category: null,
      maxConfidence: null,
      withOffers: false,
      q: null,
      page: 1,
    });
  });

  it('round-trips with reviewQuery, leaving defaults out', () => {
    const filters = { type: 'new_product', category: 'Fats & Oils', maxConfidence: 0.9, withOffers: true, q: 'palm oil', page: 2 } as const;
    expect(reviewFilters(new URLSearchParams(reviewQuery(filters)))).toEqual(filters);
    expect(reviewQuery({ page: 1, withOffers: false })).toBe('');
  });
});

describe('purchaseAction', () => {
  it('keeps only the fields of each action', () => {
    expect(purchaseAction({ action: 'approve', itemId: '12', name: '  Whey  Protein 80% ', category: '', extra: 1 })).toEqual({
      action: 'approve',
      itemId: 12,
      name: 'Whey Protein 80%',
      category: undefined,
    });
    expect(purchaseAction({ action: 'merge', itemId: 1, targetId: 2 })).toEqual({ action: 'merge', itemId: 1, targetId: 2 });
    expect(purchaseAction({ action: 'approveBulk', itemIds: [3, 3, '4', -1, 'x'] })).toEqual({ action: 'approveBulk', itemIds: [3, 4] });
    expect(purchaseAction({ action: 'decide', proposalId: 5, status: 'rejected', note: ' too old ' })).toEqual({
      action: 'decide',
      proposalId: 5,
      status: 'rejected',
      optionId: undefined,
      note: 'too old',
    });
  });

  it('rejects incomplete or unknown actions', () => {
    expect(() => purchaseAction({ action: 'remap', itemId: 1 })).toThrow(PurchaseInputError);
    expect(() => purchaseAction({ action: 'approve', itemId: 1.5 })).toThrow(PurchaseInputError);
    expect(() => purchaseAction({ action: 'approveBulk', itemIds: [] })).toThrow('Choose the items');
    expect(() => purchaseAction({ action: 'approveBulk', itemIds: Array.from({ length: 101 }, (_, i) => i + 1) })).toThrow('at most 100');
    expect(() => purchaseAction({ action: 'decide', proposalId: 5, status: 'approved' })).toThrow('supplier option');
    expect(() => purchaseAction({ action: 'decide', proposalId: 5, status: 'sent' })).toThrow('Unknown decision');
    expect(() => purchaseAction({ action: 'drop' })).toThrow('Unknown action');
    expect(() => purchaseAction(null)).toThrow('Unknown action');
  });
});

describe('proposalStatus', () => {
  it('accepts known statuses only', () => {
    expect(proposalStatus('approved')).toBe('approved');
    expect(proposalStatus('all')).toBeNull();
  });
});
