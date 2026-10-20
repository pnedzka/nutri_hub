import { useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { Select } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { formatDays } from '../../../shared/leave';
import type { EmployeeRow, EmployeeSettingsUpdate, EmployeesResponse, Person } from '../../../shared/leaveApi';
import { BalanceSummary } from './MyLeave';
import { Empty, ErrorNote, Loading } from './ui';
import { useApi } from './useApi';

function EditForm({ row, year, people, onSaved, onCancel }: { row: EmployeeRow; year: number; people: Person[]; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [managerId, setManagerId] = useState(row.settings.managerId ?? '');
  const [annualDays, setAnnualDays] = useState(String(row.settings.annualDays));
  const [allowance, setAllowance] = useState(String(row.balance.allowance));
  const [startYear, setStartYear] = useState(String(row.settings.startYear));
  const [carriedOver, setCarriedOver] = useState(String(row.settings.carriedOver));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: EmployeeSettingsUpdate = {
        userId: row.person.id,
        managerId: managerId || null,
        annualDays: Number(annualDays),
        allowance: Number(allowance),
        startYear: Number(startYear),
        carriedOver: Number(carriedOver),
      };
      await api('/api/leave/employees', { method: 'PUT', body });
      toast.success('Saved', row.person.name);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const number = { type: 'number', min: 0, step: 0.5, required: true, inputMode: 'decimal' as const };
  return (
    <form onSubmit={submit} className="mt-4 space-y-4 border-t border-gray-100 pt-4">
      <Select id={`manager-${row.person.id}`} label="Manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} hint="Approves this person's requests. Administrators can always approve.">
        <option value="">None (administrators approve)</option>
        {people
          .filter((p) => p.id !== row.person.id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id={`annual-${row.person.id}`} label="Days a year" max={60} {...number} value={annualDays} onChange={(e) => setAnnualDays(e.target.value)} />
        <Input id={`allowance-${row.person.id}`} label={`Days for ${year}`} max={60} {...number} value={allowance} onChange={(e) => setAllowance(e.target.value)} />
        <Input
          id={`start-${row.person.id}`}
          label="First year in the app"
          type="number"
          min={2020}
          max={year}
          step={1}
          required
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
        />
        <Input id={`carried-${row.person.id}`} label={`Carried over into ${startYear || 'that year'}`} {...number} value={carriedOver} onChange={(e) => setCarriedOver(e.target.value)} />
      </div>
      <p className="text-xs text-gray-500">
        “Days a year” is used for each new year. “Carried over” is the leave left from before (the old intranet), added to the first year.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" isLoading={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Employees({ onChange }: { onChange: () => void }) {
  const { data, error, reload } = useApi<EmployeesResponse>('/api/leave/employees');
  const [editing, setEditing] = useState<string | null>(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  if (!data.employees.length) return <Empty>Nobody has access to Leave yet.</Empty>;
  const people = data.employees.map((e) => e.person);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Everyone with access to Leave. Set each person's manager and days of leave; people not set up yet use 26 days a year.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.employees.map((row) => (
          <Card key={row.person.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-gray-900">
                    {row.person.name}
                    {row.isAdmin && <span className="ml-2 align-middle rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">Admin</span>}
                  </h3>
                  <p className="truncate text-sm text-gray-500">{row.person.email}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Manager: {row.manager?.name ?? '—'} · {formatDays(row.settings.annualDays)} a year
                    {!row.configured && <span className="ml-2 text-amber-700">Not set up</span>}
                  </p>
                </div>
                {editing !== row.person.id && (
                  <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-0" onClick={() => setEditing(row.person.id)}>
                    <Pencil size={14} />
                    Edit
                  </Button>
                )}
              </div>
              <div className="mt-4">
                <BalanceSummary balance={row.balance} />
              </div>
              {editing === row.person.id && (
                <EditForm
                  row={row}
                  year={data.year}
                  people={people}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    reload();
                    onChange();
                  }}
                />
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
