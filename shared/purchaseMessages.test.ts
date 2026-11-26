import { describe, expect, it } from 'vitest';
import { ALREADY_CLOSED, purchaseMessage } from './purchaseMessages';

describe('purchaseMessage', () => {
  it('translates the messages of the database functions, keeping their numbers and names', () => {
    expect(purchaseMessage('Pozycja 42 jest już zamknięta (resolved)')).toBe('Item 42 is already closed (resolved). Someone decided it in the meantime.');
    expect(purchaseMessage('Propozycja jest już rozstrzygnięta. Najpierw cofnij decyzję.')).toBe('The proposal is already decided. Undo the decision first.');
    expect(purchaseMessage('Propozycja 7 ma status approved i nie można jej zmienić')).toBe('Proposal 7 is approved and cannot be changed.');
    expect(purchaseMessage('Produkt o nazwie "Pea protein" już istnieje, użyj scalania')).toBe('A product named "Pea protein" already exists. Merge into it instead.');
    expect(purchaseMessage('Produkt docelowy 5 nie istnieje albo jest odrzucony')).toBe('The target product 5 does not exist or is rejected.');
    expect(purchaseMessage('Produkt 5 nie istnieje')).toBe('Product 5 does not exist.');
    expect(purchaseMessage('Opcja 3 nie należy do propozycji 9')).toBe('Offer 3 is not on proposal 9.');
  });
  it('leaves English and unknown messages as they are', () => {
    expect(purchaseMessage('Apex Bid was checked less than a minute ago. Try again in a moment.')).toBe('Apex Bid was checked less than a minute ago. Try again in a moment.');
    expect(purchaseMessage('Coś nowego')).toBe('Coś nowego');
  });
  it('recognises an item closed in the meantime in both languages', () => {
    expect(ALREADY_CLOSED.test(purchaseMessage('Pozycja 1 jest już zamknięta (resolved)'))).toBe(true);
    expect(ALREADY_CLOSED.test('Pozycja 1 jest już zamknięta (resolved)')).toBe(true);
  });
});
