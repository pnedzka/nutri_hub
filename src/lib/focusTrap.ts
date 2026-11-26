import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard handling for anything laid over the page (windows, the menu drawer, the bell, the Org chart panel; W3 of
 * the UI audit, 26.11.2026): while `active`, the focus moves in ([data-autofocus] or the first control), Escape calls
 * `onEscape`, Tab and Shift+Tab stay inside when `trap` says so, and the focus goes back where it was afterwards.
 */
export function useFocusTrap(
  box: RefObject<HTMLElement | null>,
  active: boolean,
  { onEscape, trap = true }: { onEscape: () => void; trap?: boolean | (() => boolean) },
) {
  // The latest callbacks, so a new function on every render does not move the focus again.
  const escape = useRef(onEscape);
  const shouldTrap = useRef(trap);
  useEffect(() => {
    escape.current = onEscape;
    shouldTrap.current = trap;
  });

  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const focusable = () => [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => !el.hasAttribute('disabled'));
    (box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escape.current();
        return;
      }
      const trapping = typeof shouldTrap.current === 'function' ? shouldTrap.current() : shouldTrap.current;
      if (e.key !== 'Tab' || !trapping) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = box.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before?.isConnected) before.focus?.();
    };
  }, [active, box]);
}
