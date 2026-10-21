import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  /** A path inside the hub, or a function to run. */
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
  /** Shown greyed out, with the reason under the label. */
  disabledReason?: string;
}

const MENU_WIDTH = 240;
const GAP = 4;

/**
 * "⋯" button with a list of actions. The list is positioned on the screen (fixed), so a table that scrolls
 * sideways does not cut it off; it opens above the button when there is no room below. Escape, a click outside,
 * scrolling or a resize close it. Items are at least 44 px high on touch screens.
 */
export function ActionsMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const rect = button.current!.getBoundingClientRect();
      const height = menu.current?.offsetHeight ?? 0;
      const width = Math.min(MENU_WIDTH, window.innerWidth - 2 * GAP * 4);
      const left = Math.max(GAP * 4, Math.min(rect.right - width, window.innerWidth - width - GAP * 4));
      const below = rect.bottom + GAP;
      const top = below + height > window.innerHeight - GAP && rect.top - GAP - height > 0 ? rect.top - GAP - height : below;
      setPosition({ top, left });
    };
    place();
    // The height is known after the first paint of the list.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const choose = (action: MenuAction) => {
    setOpen(false);
    if (action.to) navigate(action.to);
    else action.onSelect?.();
  };

  /** Arrow keys move between the items. */
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: Math.min(MENU_WIDTH, window.innerWidth - 32) }}
          className="fixed z-50 rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={Boolean(action.disabledReason)}
              onClick={() => choose(action)}
              className={`flex w-full items-start gap-2.5 px-3 py-2 min-h-10 pointer-coarse:min-h-11 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                action.danger ? 'text-red-600' : 'text-gray-700'
              } disabled:text-gray-400`}
            >
              <span className="mt-0.5 shrink-0">{action.icon}</span>
              <span className="min-w-0">
                {action.label}
                {action.disabledReason && <span className="block text-xs text-gray-400">{action.disabledReason}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
