// Reads a T-Mobile invoice PDF in the browser: pdfjs-dist (loaded only on this page) gives the text items of each
// page, shared/tmobile.ts turns them into lines and parses them. The PDF never leaves the computer.

import { InvoiceParseError, linesFromPages, parseTMobileInvoice, type ParsedInvoice, type TextItem } from '../../../shared/tmobile.ts';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function textOfPages(file: File): Promise<TextItem[][]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    const pages: TextItem[][] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(content.items.filter((item) => 'str' in item).map(({ str, transform, width }) => ({ str, transform, width })));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** The invoice in a PDF file; throws an Error (InvoiceParseError: with `problems`) with a message for the administrator. */
export async function readInvoice(file: File): Promise<ParsedInvoice> {
  if (file.type && file.type !== 'application/pdf') throw new Error('Choose a PDF file.');
  if (file.size > MAX_PDF_BYTES) throw new Error('The file is larger than 20 MB. Is it a T-Mobile invoice?');
  let pages: TextItem[][];
  try {
    pages = await textOfPages(file);
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('The PDF is password-protected. Save it without a password and try again.', { cause: error });
    throw new Error('The PDF could not be read. Is it a T-Mobile invoice?', { cause: error });
  }
  const lines = linesFromPages(pages);
  if (!lines.length) throw new InvoiceParseError(['The PDF has no text (a scan?). Use the PDF invoice from T-Mobile.']);
  return parseTMobileInvoice(lines);
}
