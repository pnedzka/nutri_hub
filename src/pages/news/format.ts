const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });

/** "19 Oct 2026, 14:05" (Polish time). */
export const formatWhen = (iso: string) => WHEN.format(new Date(iso));
/** "19 October 2026" (Polish time). */
export const formatDay = (iso: string) => DAY.format(new Date(iso));
