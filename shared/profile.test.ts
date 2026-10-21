import { describe, expect, it } from 'vitest';
import { cleanLinkedin, cleanOffice, cleanPhone, initials, isAvatarPathOf, profileChanges, ProfileError } from './profile';

const ID = '0b9c7a52-55a4-4d8e-9a43-8b1f2c3d4e5f';

describe('cleanPhone', () => {
  it('keeps the number as typed, with single spaces', () => {
    expect(cleanPhone(' +48  600 100 200 ')).toBe('+48 600 100 200');
    expect(cleanPhone('(17) 850-12-34')).toBe('(17) 850-12-34');
    expect(cleanPhone('')).toBeNull();
  });
  it('rejects letters and too few digits', () => {
    expect(() => cleanPhone('call me')).toThrow(ProfileError);
    expect(() => cleanPhone('+48 12')).toThrow(ProfileError);
  });
});

describe('cleanLinkedin', () => {
  it('adds https and accepts linkedin.com profiles only', () => {
    expect(cleanLinkedin('linkedin.com/in/anna-nowak')).toBe('https://linkedin.com/in/anna-nowak');
    expect(cleanLinkedin('http://pl.linkedin.com/in/anna')).toBe('https://pl.linkedin.com/in/anna');
    expect(cleanLinkedin(' ')).toBeNull();
    expect(() => cleanLinkedin('https://evil-linkedin.com/in/anna')).toThrow(ProfileError);
    expect(() => cleanLinkedin('https://www.linkedin.com/')).toThrow(ProfileError);
    expect(() => cleanLinkedin('javascript:alert(1)')).toThrow(ProfileError);
  });
});

describe('profileChanges', () => {
  it('maps only the given fields to columns', () => {
    expect(profileChanges({ name: ' Anna  Nowak ', jobTitle: '', officeId: null })).toEqual({ full_name: 'Anna Nowak', job_title: null, office_id: null });
    expect(profileChanges({})).toEqual({});
  });
  it('rejects a bad office id and text that is too long', () => {
    expect(() => profileChanges({ officeId: 'Rzeszów' })).toThrow(ProfileError);
    expect(() => profileChanges({ department: 'x'.repeat(101) })).toThrow(ProfileError);
  });
});

describe('cleanOffice', () => {
  it('needs a name', () => {
    expect(cleanOffice({ name: ' Rzeszów ', address: undefined })).toEqual({ name: 'Rzeszów', address: '' });
    expect(() => cleanOffice({ name: '  ' })).toThrow(ProfileError);
  });
});

describe('isAvatarPathOf', () => {
  it('accepts only photos in the folder of that person', () => {
    expect(isAvatarPathOf(ID, `avatars/${ID}/${ID}.jpg`)).toBe(true);
    expect(isAvatarPathOf(ID, `avatars/other/${ID}.jpg`)).toBe(false);
    expect(isAvatarPathOf(ID, `news/${ID}/${ID}.jpg`)).toBe(false);
    expect(isAvatarPathOf(ID, `avatars/${ID}/../x.jpg`)).toBe(false);
  });
});

describe('initials', () => {
  it('uses the first and last name, or the e-mail', () => {
    expect(initials('Anna Maria Nowak', 'a@x.pl')).toBe('AN');
    expect(initials('anna', 'a@x.pl')).toBe('A');
    expect(initials(null, 'jan@x.pl')).toBe('J');
  });
});
