import { Select } from './Field';

interface Candidate {
  id: string;
  email: string;
  full_name: string | null;
  status?: string;
}

/**
 * The person's manager (profiles.manager_id): approves their leave, besides the administrators. Chosen from the
 * active accounts other than the person (User management: new account and Edit).
 */
export function ManagerSelect({
  id,
  value,
  onChange,
  people,
  personId,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (managerId: string) => void;
  people: Candidate[];
  personId?: string;
  disabled?: boolean;
}) {
  const options = people
    .filter((p) => p.id !== personId && (p.status !== 'deactivated' || p.id === value))
    .map((p) => ({ id: p.id, name: p.full_name || p.email }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return (
    <Select id={id} label="Manager" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} hint="Approves this person's leave requests. Administrators can always approve.">
      <option value="">None (administrators approve)</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
