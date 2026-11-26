import { useEffect, useId, useRef, type ReactNode } from 'react';

// A window over the page in the hub's style, instead of the browser's confirm() (whose text cannot be copied on
// every device and which looks different in each browser). Escape and a click beside it close it; Tab stays inside;
// the focus goes back where it was when it closes.

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // The latest onClose, so a new function on every render does not move the focus again.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...(box.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((el) => !el.hasAttribute('disabled'));
    (box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-xl bg-white shadow-xl border border-gray-100 pb-[env(safe-area-inset-bottom)]"
      >
        <h2 id={titleId} className="px-6 pt-5 text-base font-semibold text-gray-900 [overflow-wrap:anywhere]">
          {title}
        </h2>
        <div className="px-6 py-4 text-sm text-gray-600">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}
