const EUR = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** "€1,234,567". */
export const formatEur = (value: number) => EUR.format(value);

/** "+3", "−2", "±0": a change against the previous month. */
export function formatChange(now: number, before: number): string {
  const diff = now - before;
  if (diff === 0) return '±0';
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}
