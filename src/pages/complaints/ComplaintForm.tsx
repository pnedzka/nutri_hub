import { useEffect, useState, type FormEvent } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  COMPLAINT_TYPES,
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  MAX_FILE_MB,
  TYPE_LABELS,
  cleanComplaint,
  contractTypeOf,
  normalizeContractId,
  type Complaint,
  type ComplaintType,
  type ContractInfo,
  type FileCategory,
  type Person,
} from '../../../shared/complaintsApi.ts';
import { Button } from '../../components/Button';
import { Select, Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { uploadTo } from '../contracts/common';
import { Section } from '../contracts/ui';
import { COMPLAINTS_API } from './common';

type Found = (ContractInfo & { owner: Person | null }) | null;

/** What the contract number tells: looked up while typing (a valid number of the right type only). */
function useContract(id: string, type: 'S' | 'P') {
  const [state, setState] = useState<{ id: string; contract: Found; error: string } | null>(null);
  const number = normalizeContractId(id);
  useEffect(() => {
    if (contractTypeOf(number) !== type) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ contract: Found }>(`${COMPLAINTS_API}&view=contract&id=${encodeURIComponent(number)}`, { signal: controller.signal })
        .then((r) => setState({ id: number, contract: r.contract, error: '' }))
        .catch((e: Error) => e.name !== 'AbortError' && setState({ id: number, contract: null, error: e.message }));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [number, type]);
  return state && state.id === number ? state : null;
}

function ContractNote({ found, label }: { found: ReturnType<typeof useContract>; label: string }) {
  if (!found) return null;
  if (found.error) return <p className="text-xs text-red-600">{found.error}</p>;
  if (!found.contract) return <p className="text-xs text-red-600">There is no such {label} in Contracts or in the intranet.</p>;
  const c = found.contract;
  return (
    <p className="text-xs text-gray-600" data-testid={`${label}-info`}>
      <span className="font-medium text-gray-900">{c.companyName || 'No company'}</span>
      {c.products ? ` · ${c.products}` : ''}
      {c.owner ? ` · ${c.owner.name}` : ''}
      {c.source === 'intranet' ? ' · from the intranet' : ''}
    </p>
  );
}

interface PickedFile {
  file: File;
  category: FileCategory;
}

export function ComplaintForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    salesContractId: '',
    purchaseContractId: '',
    type: 'quality' as ComplaintType,
    batchNumber: '',
    quantityKg: '',
    clientResponseDue: '',
    description: '',
  });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [category, setCategory] = useState<FileCategory>('photos');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sales = useContract(form.salesContractId, 'S');
  const purchase = useContract(form.purchaseContractId, 'P');
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const big = picked.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big.length) toast.error('Some files are too big', `Up to ${MAX_FILE_MB} MB each: ${big.map((f) => f.name).join(', ')}`);
    setFiles((now) => [...now, ...picked.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024).map((file) => ({ file, category }))]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { problems } = cleanComplaint(form);
    setErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])));
    if (problems.length) return;
    setSaving(true);
    try {
      const { complaint } = await api<{ complaint: Complaint }>(COMPLAINTS_API, { method: 'POST', body: { action: 'create', complaint: form } });
      let failed = 0;
      for (const f of files) {
        try {
          const link = await api<{ path: string; signedUrl: string }>(COMPLAINTS_API, { method: 'POST', body: { action: 'uploadUrl', id: complaint.id, fileName: f.file.name } });
          await uploadTo(link.signedUrl, f.file);
          await api(COMPLAINTS_API, { method: 'POST', body: { action: 'attach', id: complaint.id, path: link.path, fileName: f.file.name, category: f.category } });
        } catch {
          failed += 1;
        }
      }
      if (failed) toast.error(`${failed} file(s) were not uploaded`, 'Add them again on the complaint page.');
      toast.success(`Complaint ${complaint.id} registered`);
      navigate(`/complaints/${encodeURIComponent(complaint.id)}`);
    } catch (error) {
      toast.error('The complaint was not saved', (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Section title="Contracts">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Input id="sales-contract" label="Sales contract" placeholder="e.g. 64-S-DB-2026" value={form.salesContractId} onChange={set('salesContractId')} error={errors.salesContractId} className="text-base sm:text-sm" />
            <ContractNote found={sales} label="sales contract" />
          </div>
          <div className="space-y-1.5">
            <Input id="purchase-contract" label="Purchase contract (optional)" placeholder="e.g. 100-P-DB-2026" value={form.purchaseContractId} onChange={set('purchaseContractId')} error={errors.purchaseContractId} className="text-base sm:text-sm" />
            <ContractNote found={purchase} label="purchase contract" />
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">The client, the product and the trader are filled in from the contracts. The supplier comes from the purchase contract.</p>
      </Section>

      <Section title="Problem">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select id="type" label="Type" value={form.type} onChange={set('type')} className="text-base sm:text-sm">
            {COMPLAINT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
          <Input id="batch" label="Batch number" value={form.batchNumber} onChange={set('batchNumber')} className="text-base sm:text-sm" />
          <Input id="quantity" label="Quantity concerned (kg)" inputMode="decimal" value={form.quantityKg} onChange={set('quantityKg')} error={errors.quantityKg} className="text-base sm:text-sm" />
          <Input id="client-due" label="Answer the client by" type="date" value={form.clientResponseDue} onChange={set('clientResponseDue')} className="text-base sm:text-sm" />
        </div>
        <div className="mt-4">
          <Textarea
            id="description"
            label="Description"
            rows={8}
            placeholder="What is wrong, how much of the goods, what the client asks for. You can paste the client's e-mail."
            value={form.description}
            onChange={set('description')}
            className="text-base sm:text-sm"
          />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
        </div>
      </Section>

      <Section title="Files">
        <div className="flex flex-wrap items-end gap-3">
          <Select id="file-category" label="Category" value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} className="text-base sm:text-sm">
            {FILE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{FILE_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Paperclip size={16} />
            Add files
            <input type="file" multiple className="sr-only" aria-label="Add files" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {files.map((f, i) => (
              <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                <span className="text-xs text-gray-500">{FILE_CATEGORY_LABELS[f.category]}</span>
                <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((now) => now.filter((_, j) => j !== i))} className="min-h-11 min-w-11 inline-flex items-center justify-center text-gray-400 hover:text-red-600">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">Photos of the damage, the delivery protocol, lab results, the client's e-mails. Up to {MAX_FILE_MB} MB each.</p>
      </Section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => navigate('/complaints')}>Cancel</Button>
        <Button type="submit" className="min-h-11 sm:min-h-0" isLoading={saving}>Register complaint</Button>
      </div>
    </form>
  );
}
