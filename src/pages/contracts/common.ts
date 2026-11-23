import { createContext, useContext } from 'react';
import type { ContractSetup } from '../../../shared/contractsApi.ts';

export const CONTRACTS_API = '/api/people?resource=contracts';

/** Who the signed-in person is in the module (from view=setup), shared by the screens. */
export const SetupContext = createContext<ContractSetup | null>(null);
export const useSetup = () => useContext(SetupContext);

export const shortDate = (iso: string) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Uploads a file to a signed upload link of the central database's storage. */
export async function uploadTo(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
  if (!res.ok) throw new Error('The file could not be uploaded. Try again.');
}
