import type { ReactNode } from 'react';

// One pill for statuses and labels in every module (W1 of the UI audit, 26.11.2026): leave requests, contracts,
// complaints, Purchase Manager, accounts. A module only says which tone a status has.

export type PillTone = 'gray' | 'muted' | 'green' | 'greenStrong' | 'amber' | 'red' | 'blue' | 'purple' | 'brand';

const TONES: Record<PillTone, string> = {
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  muted: 'bg-gray-50 text-gray-500 border-gray-200',
  green: 'bg-green-50 text-green-800 border-green-200',
  greenStrong: 'bg-green-100 text-green-900 border-green-300',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  purple: 'bg-purple-50 text-purple-800 border-purple-200',
  brand: 'bg-[#CC1F1F]/10 text-[#CC1F1F] border-[#CC1F1F]/20',
};

export function Pill({ children, tone = 'gray', title, className = '' }: { children: ReactNode; tone?: PillTone; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
