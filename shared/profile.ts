// Profile rules shared by the server and the browser: the company contact details of an account (My profile, Team,
// User management) and the list of offices. The login e-mail is the company e-mail, so there is no separate field.

export const NAME_MAX = 200;
export const TEXT_MAX = 100;
export const PHONE_MAX = 30;
export const LINKEDIN_MAX = 300;
export const OFFICE_NAME_MAX = 80;
export const OFFICE_ADDRESS_MAX = 200;
/** Photos are cropped to a square in the browser and resized to this many pixels. */
export const AVATAR_SIDE = 512;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const isUuid = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${UUID}$`).test(value);

/** Path of a profile photo in the private "intranet" bucket: avatars/<user id>/<random>.jpg */
export const avatarPath = (userId: string, fileId: string) => `avatars/${userId}/${fileId}.jpg`;
export const isAvatarPathOf = (userId: string, path: string) => new RegExp(`^avatars/${userId}/${UUID}\\.jpg$`).test(path);

export interface Office {
  id: string;
  name: string;
  address: string;
}

/** A person as everyone signed in sees them in Team (and themselves in My profile). */
export interface TeamMember {
  id: string;
  /** Login e-mail = company e-mail. */
  email: string;
  name: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  mobile: string | null;
  linkedin: string | null;
  officeId: string | null;
  /** Signed link to the photo (valid for a day), or null. */
  avatarUrl: string | null;
}

/** The fields a person edits in My profile (an administrator in User management); omitted fields stay as they are. */
export interface ProfileInput {
  name?: string;
  jobTitle?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  linkedin?: string;
  officeId?: string | null;
  /** A photo uploaded with POST /api/people, or null to remove the photo. */
  avatarPath?: string | null;
}

export class ProfileError extends Error {}

const text = (value: unknown, max: number, label: string): string | null => {
  if (typeof value !== 'string') throw new ProfileError(`${label}: invalid value.`);
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length > max) throw new ProfileError(`${label} can have at most ${max} characters.`);
  return clean || null;
};

/** A phone number as typed, with single spaces; digits, spaces, "+", "-", "/" and brackets, at least 6 digits. */
export function cleanPhone(value: unknown, label = 'Phone'): string | null {
  const phone = text(value, PHONE_MAX, label);
  if (phone === null) return null;
  if (!/^\+?[\d\s()/-]+$/.test(phone) || phone.replace(/\D/g, '').length < 6) {
    throw new ProfileError(`${label}: enter digits only, e.g. +48 600 100 200.`);
  }
  return phone;
}

/** A LinkedIn profile address: https is added when missing; only linkedin.com and its subdomains. */
export function cleanLinkedin(value: unknown): string | null {
  const given = text(value, LINKEDIN_MAX, 'LinkedIn');
  if (given === null) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(given) ? given : `https://${given}`);
  } catch {
    throw new ProfileError('LinkedIn: enter the address of your profile, e.g. https://www.linkedin.com/in/your-name.');
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || url.pathname.length <= 1) {
    throw new ProfileError('LinkedIn: enter the address of your profile, e.g. https://www.linkedin.com/in/your-name.');
  }
  url.protocol = 'https:';
  return url.toString();
}

/** Database columns of profiles for the given input, checked; throws ProfileError with a message for the user. */
export function profileChanges(input: ProfileInput): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  if (input.name !== undefined) changes.full_name = text(input.name, NAME_MAX, 'Name');
  if (input.jobTitle !== undefined) changes.job_title = text(input.jobTitle, TEXT_MAX, 'Job title');
  if (input.department !== undefined) changes.department = text(input.department, TEXT_MAX, 'Department');
  if (input.phone !== undefined) changes.phone = cleanPhone(input.phone, 'Phone');
  if (input.mobile !== undefined) changes.mobile = cleanPhone(input.mobile, 'Mobile');
  if (input.linkedin !== undefined) changes.linkedin_url = cleanLinkedin(input.linkedin);
  if (input.officeId !== undefined) {
    if (input.officeId !== null && !isUuid(input.officeId)) throw new ProfileError('Choose an office from the list.');
    changes.office_id = input.officeId;
  }
  return changes;
}

/** An office from the administrator's form, checked. */
export function cleanOffice(value: { name?: unknown; address?: unknown }): { name: string; address: string } {
  const name = text(value.name ?? '', OFFICE_NAME_MAX, 'Office name');
  if (!name) throw new ProfileError('Give the office a name (the city).');
  return { name, address: text(value.address ?? '', OFFICE_ADDRESS_MAX, 'Address') ?? '' };
}

/** Initials for a person without a photo: "Anna Nowak" → "AN", "anna@…" → "A". */
export function initials(name: string | null, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  return (email[0] ?? '?').toUpperCase();
}

/** Labels of the account history (User management → Edit → History). */
export const EVENT_LABELS: Record<string, string> = {
  created: 'Account created',
  invited: 'Invitation sent',
  profile: 'Profile changed',
  role: 'Role changed',
  apps: 'Apps changed',
  password: 'New password set',
  link: 'E-mail link sent',
  deactivated: 'Account deactivated',
  reactivated: 'Account reactivated',
};

export interface ProfileEvent {
  id: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actor: string | null;
}
