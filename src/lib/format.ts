const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');
