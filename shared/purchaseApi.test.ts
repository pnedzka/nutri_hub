import { describe, expect, it } from 'vitest';
import {
  eurAtNbp,
  formatPrice,
  nbpEurRates,
  DEFAULT_OPTION_SORT,
  bidSellMessage,
  PurchaseInputError,
  nextOptionSort,
  proposalStatus,
  purchaseAction,
  reviewFilters,
  reviewQuery,
  sortOptions,
  topOptions,
  type ProposalOption,
} from './purchaseApi';

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
    expect(purchaseAction({ action: 'undo', itemId: 5 })).toEqual({ action: 'undo' });
    expect(purchaseAction({ action: 'refreshBids', url: 'x' })).toEqual({ action: 'refreshBids' });
    expect(purchaseAction({ action: 'decide', proposalId: 5, status: 'rejected', note: ' too old ' })).toEqual({
      action: 'decide',
      proposalId: 5,
      status: 'rejected',
      optionId: undefined,
      note: 'too old',
    });
    expect(purchaseAction({ action: 'rejectOption', optionId: '7', proposalId: 5 })).toEqual({ action: 'rejectOption', optionId: 7 });
    expect(purchaseAction({ action: 'restoreOption', rejectionId: 3 })).toEqual({ action: 'restoreOption', rejectionId: 3 });
    expect(purchaseAction({ action: 'chooseOffer', proposalId: '5', offerId: 9, extra: 1 })).toEqual({
      action: 'chooseOffer',
      proposalId: 5,
      offerId: 9,
      note: undefined,
    });
    expect(purchaseAction({ action: 'assignOffer', proposalId: 5, offerId: '9' })).toEqual({ action: 'assignOffer', proposalId: 5, offerId: 9 });
  });

  it('rejects incomplete or unknown actions', () => {
    expect(() => purchaseAction({ action: 'remap', itemId: 1 })).toThrow(PurchaseInputError);
    expect(() => purchaseAction({ action: 'approve', itemId: 1.5 })).toThrow(PurchaseInputError);
    expect(() => purchaseAction({ action: 'approveBulk', itemIds: [] })).toThrow('Choose the items');
    expect(() => purchaseAction({ action: 'approveBulk', itemIds: Array.from({ length: 101 }, (_, i) => i + 1) })).toThrow('at most 100');
    expect(() => purchaseAction({ action: 'decide', proposalId: 5, status: 'approved' })).toThrow('supplier option');
    expect(() => purchaseAction({ action: 'decide', proposalId: 5, status: 'sent' })).toThrow('Unknown decision');
    expect(() => purchaseAction({ action: 'rejectOption' })).toThrow('Offer is missing');
    expect(() => purchaseAction({ action: 'chooseOffer', proposalId: 5 })).toThrow('Offer is missing');
    expect(() => purchaseAction({ action: 'assignOffer', offerId: 9 })).toThrow('Proposal is missing');
    expect(() => purchaseAction({ action: 'restoreOption', rejectionId: 0 })).toThrow(PurchaseInputError);
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

describe('topOptions', () => {
  const options = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, rank: i + 1 }) as ProposalOption);

  it('shows the best offers and keeps the chosen and the sold ones', () => {
    expect(topOptions(options).map((o) => o.id)).toEqual([1, 2, 3, 4, 5]);
    expect(topOptions(options, [7, null, undefined, 2]).map((o) => o.id)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(topOptions(options.slice(0, 3))).toHaveLength(3);
  });
});

describe('sortOptions', () => {
  const option = (o: Partial<ProposalOption>) => ({ supplier: null, priceEurPerKg: null, quantityKg: null, incoterms: null, location: null, offeredAt: null, ...o }) as ProposalOption;
  const options = [
    option({ id: 1, rank: 1, supplier: 'beta', priceEurPerKg: 3, quantityKg: 1000, incoterms: 'FCA', offeredAt: '2026-11-10T10:00:00Z' }),
    option({ id: 2, rank: 2, supplier: 'Alpha', priceEurPerKg: null, quantityKg: 5000, incoterms: 'DAP', location: 'Lublin', offeredAt: '2026-11-15T10:00:00Z' }),
    option({ id: 3, rank: 3, trader: 'Jan', priceEurPerKg: 2.5, offeredAt: null }),
    option({ id: 4, rank: 4, supplier: 'Gamma', priceEurPerKg: 2.5, quantityKg: 2000, incoterms: 'CIF' }),
  ];
  const ids = (key: Parameters<typeof nextOptionSort>[1], direction: 'asc' | 'desc') => sortOptions(options, { key, direction }).map((o) => o.id);

  it('keeps the ranking by default', () => {
    expect(sortOptions([...options].reverse(), DEFAULT_OPTION_SORT).map((o) => o.id)).toEqual([1, 2, 3, 4]);
  });

  it('sorts by price, ties by rank, offers without a price last in both directions', () => {
    expect(ids('price', 'asc')).toEqual([3, 4, 1, 2]);
    expect(ids('price', 'desc')).toEqual([1, 3, 4, 2]);
  });

  it('sorts by supplier (BID SELL by its trader), quantity, terms and offer date', () => {
    expect(ids('supplier', 'asc')).toEqual([2, 1, 3, 4]);
    expect(ids('quantity', 'desc')).toEqual([2, 4, 1, 3]);
    expect(ids('terms', 'asc')).toEqual([4, 2, 1, 3]);
    expect(ids('offered', 'desc')).toEqual([2, 1, 3, 4]);
  });

  it('does not change the list it gets', () => {
    sortOptions(options, { key: 'price', direction: 'asc' });
    expect(options.map((o) => o.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('nextOptionSort', () => {
  it('turns the same column around and starts another one in its own direction', () => {
    expect(nextOptionSort(DEFAULT_OPTION_SORT, 'rank')).toEqual({ key: 'rank', direction: 'desc' });
    expect(nextOptionSort(DEFAULT_OPTION_SORT, 'price')).toEqual({ key: 'price', direction: 'asc' });
    expect(nextOptionSort({ key: 'price', direction: 'asc' }, 'offered')).toEqual({ key: 'offered', direction: 'desc' });
    expect(nextOptionSort({ key: 'quantity', direction: 'desc' }, 'quantity')).toEqual({ key: 'quantity', direction: 'asc' });
  });
});

describe('bidSellMessage', () => {
  const base = { id: 1, rank: 1, supplier: 'Secret Supplier Ltd', priceEurPerKg: 4.1, quantityKg: 9000, incoterms: 'FCA', location: 'PL', leadTime: 'prompt', productName: 'WPC 35' } as ProposalOption;

  it('writes the group format without the supplier', () => {
    expect(bidSellMessage(base, 'Whey protein concentrate 35%')).toBe('BID SELL\nWPC 35\n9,000 kg\n4.10 EUR/kg\nFCA PL\nLT prompt');
    expect(bidSellMessage(base, 'x')).not.toContain('Secret');
  });

  it('leaves out what the offer does not say and falls back to the card product', () => {
    const bare = { ...base, productName: null, quantityKg: null, priceEurPerKg: null, incoterms: null, location: null, leadTime: null };
    expect(bidSellMessage(bare, 'Betaine anhydrous')).toBe('BID SELL\nBetaine anhydrous');
  });
});

describe('original prices and NBP', () => {
  const nbp = nbpEurRates([
    { table: 'A', no: '223/A/NBP/2026', effectiveDate: '2026-11-18', rates: [{ code: 'EUR', mid: 4.25 }, { code: 'USD', mid: 3.825 }] },
  ]);

  it('reads EUR for one unit from NBP table A', () => {
    expect(nbp?.date).toBe('2026-11-18');
    expect(nbp?.eurPer.USD).toBeCloseTo(0.9);
    expect(nbp?.eurPer.PLN).toBeCloseTo(1 / 4.25);
    expect(nbpEurRates([{ effectiveDate: '2026-11-18', rates: [{ code: 'USD', mid: 3.8 }] }])).toBeNull();
    expect(nbpEurRates({})).toBeNull();
  });

  it('shows the price in its own currency and unit, EUR/kg only without one', () => {
    expect(formatPrice({ priceEurPerKg: 2.7, price: 3, currency: 'USD', priceUnit: 'kg' })).toBe('3.00 USD/kg');
    expect(formatPrice({ priceEurPerKg: 2.52, price: 2800, currency: 'USD', priceUnit: 'mt' })).toBe('2,800.00 USD/t');
    expect(formatPrice({ priceEurPerKg: 1.2, price: 5, currency: 'PLN', priceUnit: null })).toBe('5.00 PLN');
    expect(formatPrice({ priceEurPerKg: 2.7 })).toBe('2.70 EUR/kg');
    expect(formatPrice({ priceEurPerKg: null })).toBeNull();
  });

  it('adds EUR at the NBP rate for other currencies, per kg for tonnes', () => {
    expect(eurAtNbp({ priceEurPerKg: 2.7, price: 3, currency: 'USD', priceUnit: 'kg' }, nbp)).toBe('2.70 EUR/kg');
    expect(eurAtNbp({ priceEurPerKg: 2.52, price: 2800, currency: 'USD', priceUnit: 'mt' }, nbp)).toBe('2.52 EUR/kg');
    expect(eurAtNbp({ priceEurPerKg: 1, price: 4.25, currency: 'PLN', priceUnit: 'kg' }, nbp)).toBe('1.00 EUR/kg');
    expect(eurAtNbp({ priceEurPerKg: 2, price: 2, currency: 'EUR', priceUnit: 'kg' }, nbp)).toBeNull();
    expect(eurAtNbp({ priceEurPerKg: 2, price: 2, currency: 'CHF', priceUnit: 'kg' }, nbp)).toBeNull();
    expect(eurAtNbp({ priceEurPerKg: 2.7, price: 3, currency: 'USD', priceUnit: 'kg' }, null)).toBeNull();
  });

  it('BID SELL message keeps the original currency', () => {
    expect(bidSellMessage({ id: 1, rank: 1, supplier: 'X', priceEurPerKg: 2.7, price: 3, currency: 'USD', priceUnit: 'kg', incoterms: null, location: null, leadTime: null, quantityKg: null, offeredAt: null, source: null, productName: 'Taurine' } as never, 'Taurine')).toBe('BID SELL\nTaurine\n3.00 USD/kg');
  });
});
