import type { ReactNode } from 'react';

// Loading, errors and empty lists look the same in every module (W1 of the UI audit, 26.11.2026).

export function Loading({ label = 'Loading…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div role="status" className={`flex items-center justify-center text-sm text-gray-500 ${compact ? 'py-4' : 'py-12'}`}>
      <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </p>
  );
}

/** An empty list: one line, centred; inside a card or on its own (`card`). */
export function EmptyState({ children, card = false }: { children: ReactNode; card?: boolean }) {
  const text = <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
  return card ? <div className="rounded-xl border border-gray-100 bg-white px-5 shadow-sm">{text}</div> : text;
}
