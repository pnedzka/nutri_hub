import { useRef, useState, type FormEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { LINKEDIN_MAX, NAME_MAX, PHONE_MAX, TEXT_MAX, type Office, type ProfileInput, type TeamMember } from '../../shared/profile.ts';
import { api } from '../lib/api';
import { prepareAvatar } from '../lib/avatar';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Select } from './Field';
import { Input } from './Input';

type Draft = Required<Omit<ProfileInput, 'avatarPath' | 'officeId'>> & { officeId: string };

const draftOf = (p: TeamMember): Draft => ({
  name: p.name ?? '',
  jobTitle: p.jobTitle ?? '',
  department: p.department ?? '',
  phone: p.phone ?? '',
  mobile: p.mobile ?? '',
  linkedin: p.linkedin ?? '',
  officeId: p.officeId ?? '',
});

/**
 * Contact details and photo of one person: My profile (their own) or User management (an administrator, `asAdmin`).
 * The photo is saved as soon as it is chosen; the other fields with "Save".
 */
export function ProfileForm({ person, offices, onSaved, asAdmin = false }: { person: TeamMember; offices: Office[]; onSaved: (person: TeamMember) => void; asAdmin?: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(person));
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = asAdmin ? person.id : undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(person));

  const field = (key: keyof Draft) => ({
    id: `profile-${key}`,
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }),
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { person: saved } = await api<{ person: TeamMember }>('/api/people', {
        method: 'PATCH',
        body: { id, ...draft, officeId: draft.officeId || null },
      });
      setDraft(draftOf(saved));
      onSaved(saved);
      toast.success('Profile saved');
    } catch (err) {
      toast.error('Could not save the profile', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setPhoto = async (avatarPath: string | null) => {
    const { person: saved } = await api<{ person: TeamMember }>('/api/people', { method: 'PATCH', body: { id, avatarPath } });
    onSaved(saved);
  };

  const upload = async (file: File | undefined) => {
    if (!file || !supabase) return;
    setPhotoBusy(true);
    try {
      const blob = await prepareAvatar(file);
      const { path, token } = await api<{ path: string; token: string }>('/api/people', { method: 'POST', body: { id } });
      const { error } = await supabase.storage.from('intranet').uploadToSignedUrl(path, token, blob, { contentType: 'image/jpeg' });
      if (error) throw new Error(error.message);
      await setPhoto(path);
      toast.success('Photo saved');
    } catch (err) {
      toast.error('Could not save the photo', (err as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async () => {
    if (!confirm('Remove the photo?')) return;
    setPhotoBusy(true);
    try {
      await setPhoto(null);
      toast.success('Photo removed');
    } catch (err) {
      toast.error('Could not remove the photo', (err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={person.name} email={person.email} url={person.avatarUrl} size="lg" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" className="min-h-11 sm:min-h-0" isLoading={photoBusy} onClick={() => fileInput.current?.click()}>
              <Camera size={14} /> {person.avatarUrl ? 'Change photo' : 'Add photo'}
            </Button>
            {person.avatarUrl && (
              <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-0 text-red-600" disabled={photoBusy} onClick={() => void removePhoto()}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-500">A square photo of your face works best. It is visible to everyone signed in to the hub.</p>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" maxLength={NAME_MAX} autoComplete="name" {...field('name')} />
          <Input label="E-mail (sign-in)" value={person.email} disabled readOnly id="profile-email" />
          <Input label="Job title" maxLength={TEXT_MAX} placeholder="e.g. Key Account Manager" {...field('jobTitle')} />
          <Input label="Department" maxLength={TEXT_MAX} placeholder="e.g. Sales" {...field('department')} />
          <Input label="Phone" type="tel" maxLength={PHONE_MAX} placeholder="+48 17 000 00 00" autoComplete="tel" {...field('phone')} />
          <Input label="Mobile" type="tel" maxLength={PHONE_MAX} placeholder="+48 600 000 000" {...field('mobile')} />
          <Input label="LinkedIn (optional)" type="url" inputMode="url" maxLength={LINKEDIN_MAX} placeholder="https://www.linkedin.com/in/…" {...field('linkedin')} />
          <Select label="Office" {...field('officeId')}>
            <option value="">—</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-gray-500">
          {asAdmin
            ? 'The person can change these details themselves in My profile.'
            : 'Your e-mail signature is filled from these details, so write the job title and department in English. The sign-in e-mail, role and apps are changed by an administrator.'}
        </p>
        <Button type="submit" isLoading={saving} disabled={!dirty}>
          Save
        </Button>
      </form>
    </div>
  );
}
