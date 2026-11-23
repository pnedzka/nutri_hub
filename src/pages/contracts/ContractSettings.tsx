import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import type { SettingsFile } from '../../../shared/contractsApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CONTRACTS_API, uploadTo } from './common';
import { Section } from './ui';

/**
 * The files the contracts need: the terms attached to every contract (OWS for sales, OWZ for purchases; contract
 * administrators) and the signature images that go into the PDF (contract administrators, or each signer their own).
 */
export function ContractSettings() {
  const [files, setFiles] = useState<SettingsFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<SettingsFile | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ files: SettingsFile[] }>(`${CONTRACTS_API}&view=files`)
      .then((r) => setFiles(r.files))
      .catch((e: Error) => toast.error('Settings could not be loaded', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);

  async function upload(file: File, item: SettingsFile) {
    const pdf = item.key.endsWith('.pdf');
    if (pdf ? file.type !== 'application/pdf' : file.type !== 'image/png') {
      toast.error(pdf ? 'Choose a PDF file' : 'Choose a PNG image', pdf ? undefined : 'A signature on a transparent background looks best.');
      return;
    }
    setBusy(item.key);
    try {
      const { signedUrl } = await api<{ signedUrl: string }>(CONTRACTS_API, { method: 'POST', body: { action: 'settingsUploadUrl', key: item.key } });
      await uploadTo(signedUrl, file);
      toast.success('File uploaded', item.label);
      load();
    } catch (error) {
      toast.error('The file was not uploaded', (error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Files for the contracts">
      <input ref={input} type="file" className="hidden" accept="application/pdf,image/png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && target.current) upload(file, target.current);
        }} />
      {!files ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !files.length ? (
        <p className="text-sm text-gray-500">There is nothing for you to set here.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {files.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{f.label}</p>
                {f.url ? (
                  <p className="inline-flex items-center gap-1 text-xs text-green-700">
                    <Check size={14} /> Uploaded ·{' '}
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-[#CC1F1F] hover:underline">
                      open
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">Not uploaded yet</p>
                )}
              </div>
              {f.key.endsWith('.png') && f.url && <img src={f.url} alt="" className="h-10 max-w-40 object-contain" />}
              <Button variant="secondary" className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" isLoading={busy === f.key}
                onClick={() => {
                  target.current = f;
                  input.current?.click();
                }}>
                <Upload size={16} /> {f.url ? 'Replace' : 'Upload'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-500">
        The terms are attached to every contract the trader downloads. A signature goes into the PDF of the contracts that person signs.
      </p>
    </Section>
  );
}
