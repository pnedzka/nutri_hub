import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * A row that scrolls sideways on narrow screens (module tabs, filter chips).
 * A soft fade on the side shows that there is more to scroll to, and the
 * active item (aria-current="page" or aria-pressed="true") is scrolled into view.
 */
export function ScrollRow({ className = '', children, watch }: { className?: string; children: ReactNode; watch?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const { pathname } = useLocation();

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    row.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const row = ref.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]');
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;
    const start = active.offsetLeft - row.offsetLeft;
    const end = start + active.offsetWidth;
    if (start < row.scrollLeft || end > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, start - (row.clientWidth - active.offsetWidth) / 2);
    }
  }, [pathname, watch]);

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#F5F5F5] to-transparent transition-opacity ${edges.left ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        aria-hidden
        data-testid="scroll-more"
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#F5F5F5] to-transparent transition-opacity ${edges.right ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
