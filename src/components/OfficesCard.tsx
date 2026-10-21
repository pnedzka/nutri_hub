import { useEffect, useState, type FormEvent } from 'react';
import { Building, Pencil, Plus, Trash2 } from 'lucide-react';
import { OFFICE_ADDRESS_MAX, OFFICE_NAME_MAX, type Office } from '../../shared/profile.ts';
import { api } from '../lib/api';
import { usePeople } from '../lib/people';
import { useToast } from '../lib/toast';
import { Button } from './Button';
import { Card, CardBody, CardHeader } from './Card';
import { Input } from './Input';

type Draft = { id?: string; name: string; address: string };

/** User management → Offices: the cities people choose in their profile; the address goes into e-mail signatures. */
export function OfficesCard() {
  const toast = useToast();
  const { offices, setOffices, load } = usePeople();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void load(), [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      setOffices((await api<{ offices: Office[] }>('/api/people', { method: 'PUT', body: draft })).offices);
      toast.success(draft.id ? 'Office saved' : 'Office added');
      setDraft(null);
    } catch (err) {
      toast.error('Could not save the office', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (office: Office) => {
    if (!confirm(`Remove the office ${office.name}?\n\nPeople of this office will have no office in their profile.`)) return;
    try {
      setOffices((await api<{ offices: Office[] }>('/api/people', { method: 'DELETE', body: { id: office.id } })).offices);
      void load(true);
      toast.success(`Office ${office.name} removed`);
    } catch (err) {
      toast.error('Could not remove the office', (err as Error).message);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader className="flex items-center gap-2">
        <Building size={16} className="text-[#CC1F1F]" />
        <h2 className="text-sm font-semibold text-gray-900">Offices</h2>
      </CardHeader>
      <ul className="divide-y divide-gray-100">
        {offices.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-3 px-6 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{o.name}</p>
              <p className="text-xs text-gray-500 break-words">{o.address || 'No address'}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setDraft({ id: o.id, name: o.name, address: o.address })}
                className="rounded-lg p-1.5 pointer-coarse:p-3 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                aria-label={`Edit the office ${o.name}`}
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => void remove(o)}
                className="rounded-lg p-1.5 pointer-coarse:p-3 text-gray-400 hover:text-red-600 hover:bg-red-50"
                aria-label={`Remove the office ${o.name}`}
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <CardBody className={offices.length ? 'border-t border-gray-100' : ''}>
        {draft ? (
          <form onSubmit={save} className="space-y-3" onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}>
            <Input id="office-name" label="City" required maxLength={OFFICE_NAME_MAX} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            <Input
              id="office-address"
              label="Address (in English, for e-mail signatures)"
              maxLength={OFFICE_ADDRESS_MAX}
              placeholder="Street 1, 00-000 City, Poland"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" isLoading={busy}>{draft.id ? 'Save' : 'Add office'}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setDraft({ name: '', address: '' })}>
            <Plus size={14} /> Add office
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
