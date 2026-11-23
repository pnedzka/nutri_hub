// The contract as a PDF, made in the browser with pdfmake (loaded only when someone downloads a contract). The PDF is
// the document the client signs; the terms (OWS for sales, OWZ for purchases) are a separate PDF next to it.

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  INCOTERM_NAMES,
  TERMS_TITLE,
  countryName,
  lineTotal,
  money,
  paymentText,
  type Contract,
  type Party,
} from '../../../shared/contractsApi.ts';

/** Nutri Partners as a party of every contract. */
export const NUTRI_PARTNERS = {
  name: 'Nutri Partners Sp. z o.o.',
  street: 'Prof. Ludwika Chmaja 6',
  postalCode: '35-021',
  city: 'Rzeszów',
  country: 'Poland',
  vatId: 'PL8133925741',
  email: 'office@nutripartners.co, logistics@nutripartners.co',
  phone: '+48 668 211 231',
};

const RED = '#CC1F1F';
const GREY = '#6B7280';

const date = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '–');

/** ISO week number of a yyyy-mm-dd date. */
export function isoWeek(iso: string): number {
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const qty = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 }).replace(/,/g, ' ');

function heading(text: string): Content {
  return { text, style: 'h2', margin: [0, 14, 0, 6] };
}

function rows(pairs: [string, string][]): Content {
  return {
    table: { widths: [90, '*'], body: pairs.filter(([, v]) => v).map(([k, v]) => [{ text: k, color: GREY }, v]) },
    layout: 'noBorders',
  };
}

function partyBlock(title: string, p: Omit<Party, 'contactFirstName' | 'contactLastName' | 'contactPosition'> & { representative: string }): Content {
  return [
    { text: title, bold: true, margin: [0, 0, 0, 4] },
    rows([
      ['Name', p.companyName],
      ['Address', `${p.street}, ${p.postalCode} ${p.city}`],
      ['Country', countryName(p.country)],
      ['VAT ID', p.vatId],
      ['Represented by', p.representative],
      ['E-mail', p.email],
      ['Phone', p.phone],
    ]),
  ];
}

/** The document definition (exported for tests); `signature` is a data: URL of the signer's signature. */
export function contractDocument(contract: Contract, images: { logo?: string; signature?: string }): TDocumentDefinitions {
  const { party, products, delivery, payment, documents } = contract.data;
  const sale = contract.type === 'S';
  const signed = Boolean(contract.signedBy);
  const ours = {
    companyName: NUTRI_PARTNERS.name,
    vatId: NUTRI_PARTNERS.vatId,
    email: NUTRI_PARTNERS.email,
    phone: NUTRI_PARTNERS.phone,
    street: NUTRI_PARTNERS.street,
    postalCode: NUTRI_PARTNERS.postalCode,
    city: NUTRI_PARTNERS.city,
    country: 'PL',
    representative: contract.signedBy ? [contract.signedBy.name, contract.signedBy.title].filter(Boolean).join(' – ') : '',
  };
  const theirs = {
    ...party,
    representative: [`${party.contactFirstName} ${party.contactLastName}`.trim(), party.contactPosition].filter(Boolean).join(' – '),
  };
  const ourRole = sale ? 'Seller' : 'Buyer';
  const theirRole = sale ? 'Buyer' : 'Supplier';

  const productTable: Content = {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        ['Product', 'Quantity', 'Unit price', 'Total'].map((t, i) => ({ text: t, bold: true, alignment: i ? 'right' : 'left', fillColor: '#F5F5F5' })),
        ...products.map((line) => [
          line.name,
          { text: `${qty(line.quantity)} ${line.unit}`, alignment: 'right' },
          { text: `${money(line.unitPrice, contract.currency)} / ${line.priceUnit === '1000PCS' ? '1000 PCS' : line.priceUnit}`, alignment: 'right' },
          { text: money(lineTotal(line) ?? 0, contract.currency), alignment: 'right' },
        ]),
        [{ text: 'Total (net)', bold: true, colSpan: 3 }, '', '', { text: money(contract.amountNet, contract.currency), bold: true, alignment: 'right' }],
      ],
    },
    layout: { hLineColor: () => '#E5E7EB', vLineColor: () => '#E5E7EB', paddingTop: () => 4, paddingBottom: () => 4 },
  } as Content;

  const deliveryDate = `${date(delivery.dateFrom)} (week ${isoWeek(delivery.dateFrom)})${
    delivery.dateTo && delivery.dateTo !== delivery.dateFrom ? ` – ${date(delivery.dateTo)} (week ${isoWeek(delivery.dateTo)})` : ''
  }`;

  const factoring: Content[] = payment.factoring
    ? [
        heading('Factoring'),
        {
          ol: [
            `Payment via factoring: the Parties agree that payment for the delivery of the Goods shall be made by an external factoring company (the "Factor"), to which the Seller has assigned its receivable. Payment made by the Factor to the Seller constitutes a full and final settlement of the Buyer's obligation.`,
            `Confirmation of receipt: the Buyer undertakes to provide the Factor with a written or electronic confirmation of the receipt of the Goods and the correct execution of the transaction, without objections, promptly and no later than 48 (forty-eight) hours from the actual receipt of the Goods.`,
            `Failure to confirm: if the Buyer, for reasons attributable to the Buyer, fails to provide the confirmation within the term in paragraph 2, it is a material breach of this contract, entitling the Seller and/or the Factor to take all legal steps provided by law to enforce it and to seek damages, including legal proceedings.`,
          ],
        },
      ]
    : [];

  const signatureBox = (title: string, name: string, image?: string): Content => ({
    stack: [
      { text: title, bold: true },
      image ? { image, fit: [160, 60], margin: [0, 6, 0, 0] } : { text: ' ', margin: [0, 30, 0, 30] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: GREY }] },
      { text: name, color: GREY, margin: [0, 3, 0, 0] },
    ],
  });

  const ourSignature = signatureBox(`${ourRole} signature`, [NUTRI_PARTNERS.name, ours.representative].filter(Boolean).join('\n'), images.signature);
  const theirSignature = signatureBox(`${theirRole} signature`, party.companyName);

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: `${sale ? 'Sales' : 'Purchase'} contract ${contract.id}`, author: NUTRI_PARTNERS.name },
    watermark: signed ? undefined : { text: 'DRAFT', color: RED, opacity: 0.08, bold: true },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.2 },
    styles: { h1: { fontSize: 16, bold: true }, h2: { fontSize: 11, bold: true, color: RED } },
    footer: (page, pages) => ({ text: `${contract.id} · page ${page} of ${pages}`, alignment: 'center', color: GREY, fontSize: 8 }),
    content: [
      {
        columns: [
          images.logo ? { image: images.logo, width: 130 } : { text: 'Nutri Partners', bold: true, fontSize: 14 },
          { stack: [{ text: sale ? 'SALES CONTRACT' : 'PURCHASE CONTRACT', style: 'h1' }, `No. ${contract.id}`, `Date: ${date(contract.submissionDate)}`], alignment: 'right' },
        ],
      },
      heading('Parties'),
      { columns: [partyBlock(`${ourRole}`, ours), partyBlock(`${theirRole}`, theirs)], columnGap: 20 },
      heading('Goods'),
      productTable,
      heading('Delivery'),
      rows([
        ['Incoterms 2020', `${delivery.incoterm} – ${INCOTERM_NAMES[delivery.incoterm]}${delivery.byAir ? ' (by air)' : ''}`],
        ['Address', `${delivery.street}, ${delivery.postalCode} ${delivery.city}, ${countryName(delivery.country)}`],
        ['Delivery date', deliveryDate],
        ['Contact', [delivery.contactName, delivery.contactEmail, delivery.contactPhone].filter(Boolean).join(', ')],
        ['Instructions', delivery.instructions],
      ]),
      heading('Payment'),
      rows([
        ['Terms', paymentText(payment)],
        ['Currency', contract.currency],
        ['Notes', payment.notes],
      ]),
      ...factoring,
      heading('Required documents'),
      { text: documents.join(', ') },
      heading(TERMS_TITLE[contract.type]),
      {
        text: `The ${TERMS_TITLE[contract.type]} of ${NUTRI_PARTNERS.name}, attached to this contract, constitute an integral part of it. Matters not regulated by this contract and the ${TERMS_TITLE[contract.type]} are governed by the provisions of the Polish Civil Code.`,
      },
      { columns: [ourSignature, theirSignature], columnGap: 40, margin: [0, 30, 0, 0], unbreakable: true } as Content,
    ],
  };
}

async function asDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Builds the PDF and saves it as "<number>.pdf". */
export async function downloadContractPdf(contract: Contract, signatureUrl: string | null): Promise<void> {
  const [pdfModule, vfsModule, logo, signature] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    asDataUrl('/logo.png'),
    signatureUrl ? asDataUrl(signatureUrl) : Promise.resolve(undefined),
  ]);
  // The browser builds are CommonJS: the module itself or its default export, depending on the bundler.
  const pdfMake = ((pdfModule as { default?: unknown }).default ?? pdfModule) as typeof import('pdfmake');
  const vfs = ((vfsModule as { default?: unknown }).default ?? vfsModule) as Parameters<typeof pdfMake.addVirtualFileSystem>[0];
  pdfMake.addVirtualFileSystem(vfs);
  await pdfMake.createPdf(contractDocument(contract, { logo, signature })).download(`${contract.id}.pdf`);
}

/** Saves a file from a signed link under the given name (the terms, the client's scan). */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('The file could not be downloaded. Try again.');
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
