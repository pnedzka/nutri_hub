// The database functions of the Purchase Manager (purchase_api, core.* in nutri-central-db) raise their messages for
// the person in Polish, but the interface is in English. The server translates the known ones here, before they go to
// the browser; an unknown message goes as it is. Translating here instead of in SQL leaves the functions in the shared
// production database untouched. A new message in SQL: add its translation here (shared/purchaseMessages.test.ts).

const ANY = '(.+?)';
const RULES: [RegExp, (...parts: string[]) => string][] = [
  [new RegExp(`^Pozycja ${ANY} jest już zamknięta \\(${ANY}\\)$`), (id, status) => `Item ${id} is already closed (${status}). Someone decided it in the meantime.`],
  [new RegExp(`^Pozycja ${ANY} nie istnieje$`), (id) => `Item ${id} does not exist.`],
  [new RegExp(`^Pozycja ${ANY} nie jest pozycją przeglądu produktów$`), (id) => `Item ${id} is not a product review item.`],
  [new RegExp(`^Pozycja ${ANY} nie ma nazwy źródłowej$`), (id) => `Item ${id} has no source name.`],
  [new RegExp(`^Produkt ${ANY} jest już odrzucony lub scalony$`), (id) => `Product ${id} is already rejected or merged.`],
  [new RegExp(`^Produkt ${ANY} jest odrzucony lub scalony$`), (id) => `Product ${id} is rejected or merged.`],
  [new RegExp(`^Produkt docelowy ${ANY} nie istnieje albo jest odrzucony$`), (id) => `The target product ${id} does not exist or is rejected.`],
  [new RegExp(`^Produkt ${ANY} nie istnieje albo jest odrzucony$`), (id) => `Product ${id} does not exist or is rejected.`],
  [new RegExp(`^Produkt ${ANY} nie istnieje$`), (id) => `Product ${id} does not exist.`],
  [/^Produkt karty jest odrzucony albo nie istnieje$/, () => "The card's product is rejected or does not exist."],
  [new RegExp(`^Produkt o nazwie "${ANY}" już istnieje, użyj scalania$`), (name) => `A product named "${name}" already exists. Merge into it instead.`],
  [/^Nie można scalić produktu z samym sobą$/, () => 'A product cannot be merged into itself.'],
  [/^Inny produkt dotyczy tylko niepewnych dopasowań; dla nowego produktu użyj scalania$/, () => '"Another product" is only for uncertain matches. For a new product, use Merge.'],
  [new RegExp(`^Propozycja ${ANY} ma status ${ANY} i nie można jej zmienić$`), (id, status) => `Proposal ${id} is ${status} and cannot be changed.`],
  [new RegExp(`^Propozycja ${ANY} nie istnieje$`), (id) => `Proposal ${id} does not exist.`],
  [/^Propozycja jest już rozstrzygnięta\. Najpierw cofnij decyzję\.$/, () => 'The proposal is already decided. Undo the decision first.'],
  [/^Wybierz opcję dostawcy$/, () => 'Choose a supplier offer.'],
  [new RegExp(`^Opcja ${ANY} nie należy do propozycji ${ANY}$`), (option, id) => `Offer ${option} is not on proposal ${id}.`],
  [/^Tej oferty nie ma już na karcie\. Odśwież stronę\.$/, () => 'This offer is no longer on the card. Refresh the page.'],
  [/^Tej oferty nie ma w bazie\. Odśwież wyniki\.$/, () => 'This offer is not in the database. Refresh the results.'],
  [/^Oferta nie ma nazwy produktu, więc nie da się jej odrzucić\.$/, () => 'The offer has no product name, so it cannot be removed.'],
  [/^Oferta nie ma nazwy produktu, więc nie da się jej przypisać\.$/, () => 'The offer has no product name, so it cannot be added to a product.'],
  [/^To odrzucenie jest już przywrócone\. Odśwież stronę\.$/, () => 'This offer is already restored. Refresh the page.'],
  [/^Nie ma takiej decyzji do cofnięcia$/, () => 'There is no such decision to undo.'],
  [/^Nie ma decyzji do cofnięcia$/, () => 'There is no decision to undo.'],
  [/^Ta decyzja jest już cofnięta$/, () => 'This decision is already undone.'],
  [/^Te produkty zmieniła już późniejsza decyzja\. Cofnij najpierw ją\.$/, () => 'A later decision has changed these products. Undo that one first.'],
  [/^Brak decided_by$/, () => 'Who decided is missing. Sign in again.'],
];

export function purchaseMessage(message: string): string {
  for (const [pattern, english] of RULES) {
    const match = pattern.exec(message);
    if (match) return english(...match.slice(1));
  }
  return message;
}

/** The answer when a review item was decided in the meantime, in either language (ProductReview refreshes the list). */
export const ALREADY_CLOSED = /już zamknięta|is already closed/;
